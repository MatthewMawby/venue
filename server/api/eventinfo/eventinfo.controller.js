/**
 * Using Rails-like standard naming convention for endpoints.
 * GET     /api/eventinfos              ->  index
 * POST    /api/eventinfos              ->  create
 * GET     /api/eventinfos/:id          ->  show
 * PUT     /api/eventinfos/:id          ->  update
 * DELETE  /api/eventinfos/:id          ->  destroy
 */

'use strict';

var _ = require('lodash');
var EventInfo = require('./eventinfo.model');
var SectionEvent = require('../sectionevent/sectionevent.model');
var fs = require('fs');
var mkdirp = require('mkdirp');
var config = require('../../config/environment');
var imageUpload = require('../../components/imageUpload');
var imageDownload = require('../../components/imageDownload');
var path = require('path');

import async from 'async';

function handleError(res, statusCode) {
  statusCode = statusCode || 500;
  return function(err) {
    res.status(statusCode).send(err);
  };
}

function responseWithResult(res, statusCode) {
  statusCode = statusCode || 200;
  return function(entity) {
    if (entity) {
      res.status(statusCode).json(entity);
    }
  };
}

function handleEntityNotFound(res) {
  return function(entity) {
    if (!entity) {
      res.status(404).end();
      return null;
    }
    return entity;
  };
}

function saveUpdates(updates) {
  return function(entity) {
    var updated = _.merge(entity, updates);
    return updated.saveAsync()
      .spread(function(updated) {
        return updated;
      });
  };
}

function removeEntity(res) {
  return function(entity) {
    if (entity) {
      return entity.removeAsync()
        .then(function() {
          res.status(204).end();
        });
    }
  };
}

function saveEventInfoImage(files, fields, cb){
  var imagePaths = [],
      asyncTasks = [];
  if (!files){
    return imagePaths;
  }

  files.files.forEach(function(file) {
    var path = config.imageUploadPath  + 'eventInfoImages' + '/';
    asyncTasks.push( (callback) => {
      var imagePath = imageUpload.saveImage(file, path, function(err) {
        callback(err)
      });
      imagePaths.push("/api/eventinfos/image?name=" + imagePath);
      });
    });

  async.parallel(asyncTasks, (error, results) => {
    // TODO: Handle Error
    cb(imagePaths);
  });
}

// Gets a list of EventInfos
exports.index = function(req, res) {
  EventInfo.findAsync()
    .then(responseWithResult(res))
    .catch(handleError(res));
};

// Gets a single EventInfo from the DB
exports.show = function(req, res) {
  var query = EventInfo.findByIdAsync(req.params.id)

  query
    .then(handleEntityNotFound(res))
    .then((eventInfo) =>{
      if (req.query.withSectionEvents){
        eventInfo.getSectionEventsAsync({
          withCourses: req.query.withCourses
        },(sectionEvents)=>{
          eventInfo = eventInfo.toObject();
          eventInfo.sectionEvents = sectionEvents;
          responseWithResult(res)(eventInfo);
        });
      }
      else{
        responseWithResult(res)(eventInfo);
      }
    })
    .catch(handleError(res));
};

// Creates a new EventInfo in the DB
exports.create = function(req, res) {
  saveEventInfoImage(req.files, req.body, (imagePaths)=>{
    var evnt = req.body;
    evnt.creationDate = new Date();
    evnt.author = req.user._id;
    evnt.imageURLs = imagePaths;

    if (!evnt.location){
      throw "There must be a location";
    }
    if (!evnt.location.geobounds || !evnt.location.geobounds.coordinates || !evnt.location.geobounds.coordinates.length){
      throw "There must be at least one geobound polygon";
    }

    if(!evnt.location.geo || !evnt.location.geo.coordinates){
      throw "There must be a geo coordinate";
    }

    // We need to parse it like this because there is no garnuntee of valid geojson
    // and express sometimes changes the array structure to a dict

    var allShapes = []; // all the polygons, inside which a coordinate is valid
    for (var a = 0; a < evnt.location.geobounds.coordinates.length; a++){
      var poly = []; // the current polygon, can be made up of multiple lines (there can be a hole)
      var rawPoly = evnt.location.geobounds.coordinates[a];

      for (var b = 0; b < rawPoly.length; b++){
        var line = []; // one closed line of the polygon
        var rawLine = rawPoly[b];

        for (var c = 0; c < rawLine.length; c++){
          var coordsPair = []; // one closed line of the polygon
          var rawCoordsPair = evnt.location.geobounds.coordinates[a][b][c]; // a pair of coordinates

          if (!Array.isArray(rawCoordsPair)){ // if express converts it to a dict, change back to a array
            rawCoordsPair = Object.keys(rawCoordsPair).map(function (key) {
              return rawCoordsPair[key]
            });
          }
          for (var d = 0; d < rawCoordsPair.length; d++){
            //Convert coordinates to a number
            coordsPair.push(Number(rawCoordsPair[d])); // add coordinates to the coordinates Pair
          }
          line.push(coordsPair); // add the coordinates Pair to the line
        }
        poly.push(line); // add the line to the polygon
      }
      allShapes.push(poly); //add the polygon to the list of all shapes
    }
    evnt.location.geobounds.coordinates = allShapes; // save the list of all shapes

    for (var a = 0; a < evnt.location.geo.coordinates.length; a++){
      // Save the bounds as numbers
      evnt.location.geo.coordinates[a] = Number(evnt.location.geo.coordinates[a]);
    }
    //Save the radius as a number
    evnt.location.radius = Number(evnt.location.radius);

    // Create the eventInfo
    EventInfo.createAsync(evnt)
    .then(responseWithResult(res, 201))
    .catch(handleError(res));
  });
};


exports.image = function(req, res){
  // Once the server refreshes urls, this should be removed
  var imgPath;
  if (req.query.imgPath){
    imgPath = path.join(__dirname, "../../../", req.query.imgPath);
    return res.sendFile(imgPath);
  }

  // Prevents requesting arbitary files from the server
  if (req.query.name.indexOf('/') !== -1){
    return res.json(404);
  }

  // Doesn't have required parameters
  if (!req.query.name){
    return res.json(404);
  }

  return imageDownload.getImage(
    req.query.name,
    config.imageUploadPath + 'eventInfoImages/',
    req.query.size,
    res);
};


// Updates an existing EventInfo in the DB
exports.update = function(req, res) {
  if (req.body._id) {
    delete req.body._id;
  }
  EventInfo.findByIdAsync(req.params.id)
    .then(handleEntityNotFound(res))
    .then(saveUpdates(req.body))
    .then(responseWithResult(res))
    .catch(handleError(res));
};

// Deletes a EventInfo from the DB
exports.destroy = function(req, res) {
  EventInfo.findByIdAsync(req.params.id)
    .then(handleEntityNotFound(res))
    .then(removeEntity(res))
    .catch(handleError(res));
};
