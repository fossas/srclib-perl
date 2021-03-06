// This file should help with finding what type of build the user is running.
// should take in the directory that you want to explore and 
// run checks to see what type of build it is. Once the build is found,
// we run the neccessary commands to extract out the metadata information.
// In the function descriptions, we sometimes refer to the data structures
// specified in the comment header of the utils file

var path = require('path')
var _ = require('underscore')
var Promise = require('bluebird')
var glob = Promise.promisifyAll(require('glob'))
var fs = Promise.promisifyAll(require('fs'))

var utils = require('./utils.js')
var vars = require('./vars.js')

var FILE_GLOB_PATTERN = '**/*(cpanfile|Makefile\.PL|Build\.PL)'

/**
 * 
 * Find dependencies given the directory to look at and find the dependencies that directory
 * will require. 
 * 
 * @param {string} dir - directory to look into
 * @param {list[string]} ignores - files to ignore
 * @return {package unit object} - object containing the mapping of the main pkg with 
 *                                 it's dependencies:
 * {
 *      id:identifier for the source
 *      version: version of the source
 *      dependencies: {[
 *                        id: identifier for this dependency,
 *                        version: version for this dependency,
 *                        path: file_path || '' 
 *                    ], ...}
 * }      
 */
function determine(dir, ignores) {
  return getBuildFiles(dir, ignores)
  .then(function (files_found) {
    if (!files_found || _.isEmpty(files_found)) {
      return null
    }
    // if cpanfile found, we parse that, otherwise attempt to build and parse (Makefile/Build).PL
    var cpanfile_index = files_found.indexOf('cpanfile')
    var file_to_parse = (cpanfile_index > -1) ? files_found[cpanfile_index] : _.first(files_found)

    return utils.extractMetaFromBuildList(file_to_parse, dir)
    .then(function (build_files_info) { // run this after to get potential license/dep info from generating MYMETA files
      return utils.extractMetaFile(dir)
      .then(function (meta_file_info) {
        return [build_files_info, meta_file_info]
      })
    })
    .filter(function (src_unit) {
      return !!src_unit
    })
    .map(function (src_unit) {
      return filterDeps(src_unit)
    })
    .then(function injectFiles(src_units) {
      return utils.findFiles(dir)
      .then(function (files_found) {
        return _.map(src_units, function (src_unit) {
          src_unit['files'] = files_found
          return src_unit
        })
      })
    })
  })
}

/**
 * Given a directory, find all the build files present
 * 
 * @param {string} dir - Directory to look at 
 * @param {[string]} ignores - files we should ignore
 * 
 * @return {[string]} - a string of build files that we saw in the directory
 */
function getBuildFiles(dir, ignores) {
  return glob.globAsync(path.join(dir, FILE_GLOB_PATTERN), { nocase: true })
  .filter(function filterIgnores(file) {
    // filter out the files you want to ignore
    if (!ignores) return true
    file = file.toLowerCase()
    for (var i = 0; i < ignores.length; i++) {
      if (file.indexOf(ignores[i]) >= 0) return false // skip processing file
    }
    return true
  })
}

/**
 *
 * Remove some dependencies that should not be in the dependency list
 * like 'perl', 'ExtUtils::MakeMaker'. These are usually build based modules
 * that are used to configure a project. Not neccesarily used in the proj itself.
 * TODO: In the grand scope of things, this might not be important, but I just included it
 *
 * @param {source_item} deps
 *
 * @return {source_item}
 */
function filterDeps(deps) {
  if (deps['dependencies']) {
    deps['dependencies'] = _.filter(deps['dependencies'], function (dep) {
      return vars.IGNORE_DEPS.indexOf(dep.name) < 0
    })
  }

  return deps
}

module.exports = {
  determine: determine
}