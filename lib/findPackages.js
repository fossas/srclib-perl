// This file should help with finding what type of build the user is running.
// should take in the directory that you want to explore and 
// run checks to see what type of build it is.

var path = require('path')
var _ = require('underscore')
var Promise = require('bluebird')
var glob = Promise.promisifyAll(require('glob'))
var fs = Promise.promisifyAll(require('fs'))
var utils = require('./utils.js')

var FILE_GLOB_PATTERN = '*(cpanfile|Makefile\.PL|Build\.PL|MYMETA\.json|MYMETA\.yml|META\.json|META.yml)'

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
module.exports = function(dir, ignores) {
    getFiles(dir, ignores)
    .map(function (fileFound) {
        return utils.extractMetaInformation(fileFound, dir)
    })
}

function getFiles(dir, ignores) {
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