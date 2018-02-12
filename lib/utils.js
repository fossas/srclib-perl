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
      break;
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
  .then(function (rawContent) {
    var content = JSON.parse(rawContent)
    // get name and version
    var source_item = {
      'name': content.name,
      'version': content.version,
      'filePath': path.dirname(filePath)
    }
    // TODO: mymeta can have multiple types of prereqs
    // for now, we only look at stuff under the runtime of prereqs key.
    // Need to explore what else is there ("prod" || "production" || "test")
    try {
      var dependencies = _.keys(content.prereqs.runtime).map(function (runtimeType) {
        return content.prereqs.runtime[runtimeType]
      }).reduce(function (a, b) {
        return Object.assign(a, b) // flatten out
      })
    } catch (err) {
      throw new Error(err)
    }
    source_item['dependencies'] = _.keys(dependencies).map(function dependencyItemFormat(dep, idx) {
      return {
        'name': dep,
        'version': (dependencies[dep] === '0' || dependencies[dep] === 0) ? '' : dependencies[dep],
        'path': filePath
      }
    })
    return source_item
  })
  .catch(function (err) {
    throw new Error('Error in parsing (my)meta.json: ' + err) // TODO : should we error out all of this if this fails?
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
      'filePath': path.dirname(filePath)
    }
    // TODO: (my)meta can have multiple types of prereqs
    // for now, we only look at stuff under the runtime of prereqs key.
    // Need to explore what else is there ("prod" || "production" || "test")
    var dependencies = content.requires
    source_item['dependencies'] = _.keys(dependencies).map(function dependencyItemFormat(dep, idx) {
      return {
        'name': dep,
        'version': (dependencies[dep] === '0' || dependencies[dep] === 0) ? '' : dependencies[dep],
        'path': filePath
      }
    })
    return source_item
  })
  .catch(function (err) {
    throw new Error('Error in parsing (my)meta.yml' + err)
  })
}

function getDepsFromCpanfile(file, dir) {
  return new Promise(function (resolve, reject) {
    child_process.exec('cpanm --showdeps -q ' + dir, function (err, stdout, stderr) {
      if (err || stderr) {
        // We don't need to error out, just console it
        // It is an issue however if mymeta and mymeta.yml are not made
        console.error(err || stderr)
      }
      return resolve(stdout)
    })
  })
  .then(function (rawContents) {
    var lines = rawContents.split('\n')
    source_unit = {
      'name': null,
      'version': null,
      'filePath': path.dirname(file)
    }
    var dependencies = _
      .chain(lines)
      .filter(function (line) {
        return (line && line[0] !== '!')
      })
      .map(function (dep) {
        var dep_split = dep.split('~') // TODO : check with other types of version restraints
        if (dep_split.length === 1) {
          return {
            'name': dep_split[0],
            'version': null,
            'path': file
          }
        } else if (dep_split.length === 2) {
          var init_version = dep_split[1].replace(/\s/g, '') // remove whitespace
          return {
            'name': dep_split[0],
            // version can start with a 'v', can have spaces in it. We remove these but cpan doesn't mind sending that format in
            'version': init_version[0] === 'v' ? init_version.slice(1, init_version.length) : init_version,
            'path': file
          }
        }
      })
      .compact() // filter out if map function returned null
      .value()

    source_unit['dependencies'] = dependencies
    return source_unit
  })
  .catch(function (err) {
    console.error('Error in parsing output of cpanm --showdeps ' + err)
  })
}


/* From: http://search.cpan.org/~bingos/ExtUtils-MakeMaker-7.30/lib/ExtUtils/MakeMaker.pm#Module_Meta-Data_(META_and_MYMETA)
 * "If CPAN::Meta is installed, MakeMaker will automatically generate META.json and META.yml files for you and add them to your MANIFEST as part of the 'distdir' target"
 * 
 * We resolve here no matter what, and just console error and stderr
 */
function execMakefileOrBuildPL(file, dir) {
  file_loc = path.join(dir, file)
  return new Promise(function (resolve, reject) {
    child_process.exec('cd ' + dir + '; perl ' + file_loc + '; cd -', function (err, stdout, stderr) {
      if (err || stderr) {
        console.error(err || stderr)
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