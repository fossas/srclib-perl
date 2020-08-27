// General case util functions for the cpan scrlib module. Generally the functions in here
// will take in a file and gather metadata information

// instead of repeating the data structures returned in the method descriptions, I'll note
// them here:
// dependency_item:
// {
//      id: identifier,
//      version: version of the module
//      file_path: file_path || ''
// }
//
// source_item:
// {
//  id: identifier,
//  version: version of the source
//  dependencies: {[dependency_item]}
// }
//
// untriaged_item:
// [source_item, ...]

var path = require('path')
var _ = require('underscore')
var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))
var yaml = require('js-yaml');
var child_process = require('child_process')
var glob = Promise.promisifyAll(require('glob'))

var CPANFILE_SCRIPT_LOCATION = __dirname + '/../scripts/cpanfileparser.pm'
var MAKEFILE_PL_SCRIPT_LOCATION = __dirname + '/../scripts/makefileparser.pm'

function extractMetaFromBuildList(file, dir) {
  var fileLocation = path.join(dir, file)
  switch (file.toLowerCase()) {
    case 'cpanfile':
      return getDepsFromCpanfile(file, dir)
    case 'makefile.pl':
    case 'build.pl':
      return execMakefileOrBuildPL(file, dir)
      .then(function getAllMeta() {
        return extractMetaFile(dir)
      })
      .then(function (metainfo) {
        if (!metainfo || metainfo.length === 0) {
          console.error('No meta.(json/yml) files or cpan output were retrieved after running perl ' + file)
        }
        return metainfo
      })
    default:
      return Promise.resolve()
  }
}

/**
 * Given the directory, find all the meta.json/yml files. This is either called after
 * calling on the build type's meta fetchers (`cpanm --showdeps .`, `perl Makefile.pl`) or
 * one that was included in the module itself when downloaded
 * @param {string} dir
 *
 * @return {[source_item]} an array of source items that we were able to gleam
 */
function extractMetaFile(dir) {
  return glob.globAsync(path.join(dir, '*(MYMETA\.json|MYMETA\.yml|META\.json|META.yml)'), { nocase: true })
  .then(function (matchedFiles) {
    if (matchedFiles && !_.isEmpty(matchedFiles)) {
      var matchedFile = _.first(matchedFiles)
      switch (_.last(matchedFile.split('/')).toLowerCase()) {
        case 'meta.json': // fall-through
        case 'mymeta.json':
          return extractMyMetaJson(matchedFile)
          break;
        case 'meta.yml': // fall-through
        case 'mymeta.yml':
          return extractMyMetaYml(matchedFile)
          break;
      }
    }
  })
}

function extractMyMetaJson(filePath) {
  return fs.readFileAsync(filePath)
  .then(function (raw_content) {
    var content = JSON.parse(raw_content)
    // get name and version
    var source_item = {
      'name': content.name,
      'version': content.version,
      'filePath': path.dirname(filePath),
      'dependencies': []
    }
    // we only look at requires!
    if (!content.prereqs || !content.prereqs.runtime || !content.prereqs.runtime.requires) { // no deps
      return source_item
    }
    var dependencies = content.prereqs.runtime.requires
    source_item['dependencies'] = _.map(_.keys(dependencies), function dependencyItemFormat(dep, idx) {
      return {
        'name': dep,
        'version': (dependencies[dep] === '0' || dependencies[dep] === 0) ? '' : dependencies[dep],
        'path': filePath
      }
    })
    return source_item
  })
  .catch(function (err) {
    console.error('Error in parsing (my)meta.json: ' + err)
    return null
  })
}

function extractMyMetaYml(filePath) {
  return fs.readFileAsync(filePath)
  .then(function (rawContents) {
    var content = yaml.safeLoad(rawContents)
    // get name and version of source
    var source_item = {
      'name': content.name,
      'version': content.version,
      'filePath': path.dirname(filePath),
      'dependencies': []
    }
    var dependencies = content.requires
    source_item['dependencies'] = _.map(_.keys(dependencies), function dependencyItemFormat(dep, idx) {
      return {
        'name': dep,
        'version': (dependencies[dep] === '0' || dependencies[dep] === 0) ? '' : dependencies[dep],
        'path': filePath
      }
    })
    return source_item
  })
  .catch(function (err) {
    console.error('Error in parsing (my)meta.yml: ' + err)
    return null
  })
}

function getDepsFromCpanfile(file, dir) {
  return new Promise(function (resolve, reject) {
    child_process.exec('perl -I ~/perl5/lib/perl5 ' + CPANFILE_SCRIPT_LOCATION + ' ' + file, function (err, stdout, stderr) {
      if (err || stderr) {
        // We don't need to error out, just console it
        // It is an issue however if mymeta and mymeta.yml are not made
        console.error(err || stderr)
      }
      return resolve(stdout)
    })
  })
  .then(function (raw_json) { // returns object with modules as keys, and corresponding versions as values
    var reqs = JSON.parse(raw_json)
    source_unit = {
      'name': null,
      'version': null,
      'filePath': path.dirname(file)
    }

    source_unit['dependencies'] = _
    .map(_.keys(reqs), function(dep_name) {
      return {
        name: dep_name,
        version: reqs[dep_name],
        path: file
      }
    })

    return source_unit
  })
  .catch(function (err) {
    console.error('Error in parsing output of cpanfile ' + err)
  })
}


/* From: http://search.cpan.org/~bingos/ExtUtils-MakeMaker-7.30/lib/ExtUtils/MakeMaker.pm#Module_Meta-Data_(META_and_MYMETA)
 * "If CPAN::Meta is installed, MakeMaker will automatically generate META.json and META.yml files for you and add them to your MANIFEST as part of the 'distdir' target"
 * We use a script here so we can add a 1 minute timeout. Some packages were causing a build timeout (2 hours)
 * We resolve here no matter what, and just console error and stderr
 */
function execMakefileOrBuildPL(file, dir) {
  file_loc = path.join(dir, file)
  return new Promise(function (resolve, reject) {
    child_process.exec('cd ' + dir + '; perl -I ~/perl5/lib/perl5 -I ' + dir + ' ' + MAKEFILE_PL_SCRIPT_LOCATION + ' ' + file, function (err, stdout, stderr) {
      if (err || stderr) {
        console.error('Failed to parse MakeFile/Build.PL')
      }
      return resolve()
    })
  })
}

function findFiles(dir) {
  return glob.globAsync(path.join(dir, '**/*(*.pm|*.pl)'), { nocase: false })
}

module.exports = {
  extractMetaFile: extractMetaFile,
  extractMetaFromBuildList: extractMetaFromBuildList,
  findFiles: findFiles
}
