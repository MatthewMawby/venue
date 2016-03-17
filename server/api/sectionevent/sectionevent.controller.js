/**
 * Using Rails-like standard naming convention for endpoints.
 * GET     /api/sectionevents              ->  index
 * POST    /api/sectionevents              ->  create
 * GET     /api/sectionevents/:id          ->  show
 * PUT     /api/sectionevents/:id          ->  update
 * DELETE  /api/sectionevents/:id          ->  destroy
 */

'use strict';

var _ = require('lodash');
var SectionEvent = require('./sectionevent.model');
var Submission = require('../submission/submission.model');
var User = require('../user/user.model');
var Course = require('../course/course.model');
import SectionCtrl from '../section/section.controller';

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

// Find and delete all submissions with sectionEvent
function fullRemove(res){
  return (entity)=>{
    return entity.fullRemove()
      .then(()=> {
        res.status(204).end();
      });
    }
}

// Gets a list of SectionEvents
exports.index = function(req, res) {
  SectionEvent.findAsync()
    .then(responseWithResult(res))
    .catch(handleError(res));
};

// Gets a single SectionEvent from the DB
exports.show = function(req, res) {
  var query = SectionEvent.findById(req.params.id)

  if (req.query.withEventInfo){
    query = query.populate('info');
  }
  if (req.query.withSection){
    query = query.populate('section');
  }
  if (req.query.withAuthor){
    query = query.populate('author');
  }

  query.execAsync()
    .then(handleEntityNotFound(res))
    .then((entity) =>{
      if (req.query.withSectionCourse){
        return Course.populate(entity, {
            path: 'section.course'
        });
      }
      else{
        return entity;
      }
    })
    .then((entity) =>{
      if (req.query.withEventInfoAuthor){
        return User.populate(entity, {
            path: 'info.author'
        });
      }
      else{
        return entity;
      }
    })
    .then(responseWithResult(res))
    .catch(handleError(res));
};

// Creates a new SectionEvent in the DB
exports.create = function(req, res) {
  SectionEvent.createAsync(req.body)
    .then(responseWithResult(res, 201))
    .catch(handleError(res));
};

// Updates an existing SectionEvent in the DB
exports.update = function(req, res) {
  if (req.body._id) {
    delete req.body._id;
  }
  SectionEvent.findByIdAsync(req.params.id)
    .then(handleEntityNotFound(res))
    .then(saveUpdates(req.body))
    .then(responseWithResult(res))
    .catch(handleError(res));
};

// Deletes a SectionEvent from the DB
exports.destroy = function(req, res) {
  SectionEvent.findByIdAsync(req.params.id)
    .then(handleEntityNotFound(res))
    .then(fullRemove(res))
    .catch(handleError(res));
};
