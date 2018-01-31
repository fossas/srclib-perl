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

function extractMetaFromBuildList(file, dir){
    var fileLocation = path.join(dir, file)
    switch (file.toLowerCase()) {
        case 'cpanfile':
            return extractCpanfile(file, dir)
            .then(function(cpanMeta) {
                // take the information from the cpan stdout and combine it
                // with a META.json file if it was created
                return extractMetaFiles(dir).then(function (metainfo) {
                    return metainfo.push(cpanMeta)
                })
            })
            break;
        case 'makefile.pl':
            return execMakefilepl(file, dir)
            // Technically here we can inspect the Make file to look for the source version
            .then(extractMetaFiles(dir))
            .then( function (metainfo) {
                if (metainfo.length == 0) {
                    throw new Error('No meta.json files were found after running perl '+ file)
                } else {
                    return metainfo
                }
            })
            break;
        case 'build.pl':
            return execBuildpl(file, dir)
            // Technically here we can inspect the Build file to look for the source version
            .then(extractMetaFiles(dir))
            .then(function (metainfo) {
                if (metainfo.length == 0) {
                    throw new Error('No meta.json files were found after running perl ' + file)
                } else {
                    return metainfo
                }
            })
            break;
        default:
            console.log('File is not one we expected: ' + file)
            break;
    }
}

/**
 * Given the directory, find all the meta.json/yml files. This is either called after 
 * calling on the build type's meta fetchers (`cpanm --showdeps .`, `perl Makefile.pl`) or 
 * one that was included in the module itself when downloaded
 * @param {string} dir 
 */
function extractMetaFiles(dir) {
    return glob.globAsync(path.join(dir, '*(MYMETA\.json|MYMETA\.yml|META\.json|META.yml)'), { nocase: true })
    .map(function(matchedFile) {
        switch (matchedFile.toLowerCase()) { 
            case 'meta.json': // fall-through
            case 'mymeta.json':
                return extractMyMetaJson(fileLocation)
                break;
            case 'meta.yml': // fall-through
            case 'mymeta.yml':
                return extractMyMetaYml(fileLocation)
                break;
        }
    })
}

function extractMyMetaJson(filePath){
    return fs.readFileAsync(filePath)
    .then(function (rawContent) {
        var content = JSON.parse(rawContent)
        // get name and version
        var source_item = {
            'id': content.name,
            'version': content.version
        }

        // TODO: mymeta can have multiple types of prereqs
        // for now, we only look at stuff under the runtime of prereqs key.
        // Need to explore what else is there ("prod" || "production" || "test")
        var dependencies = content.prereqs.runtime.requires
        source_item['dependencies'] = Object.keys(dependencies).map(function depenencyItemFormat(dep, idx) {
            return {
                'id': dep,
                'version': dependencies[dep] == '0' ? dependencies[dep] : '',
                'filePath': filePath // TODO: specify w/ @Alex what the value of this should be
            }
        })
        return source_item
    })
    .catch(function(err){
        throw new Error('Error in parsing (my)meta.json: ' + err)
    })
}

function extractMyMetaYml(filePath) {
    return fs.readFileAsync(filePath)
    .then(function (rawContents) {
        var content = yaml.safeLoad(rawContents)
        // get name and version of source
        var source_item = {
            'id': contents.name,
            'version': content.version
        }
        // TODO: (my)meta can have multiple types of prereqs
        // for now, we only look at stuff under the runtime of prereqs key.
        // Need to explore what else is there ("prod" || "production" || "test")
        var dependencies = content.requires
        source_item['dependencies'] = Object.keys(dependencies).map(function depenencyItemFormat(dep, idx) {
            return {
                'id': dep,
                'version': dependencies[dep] == '0' ? dependencies[dep] : '', 
                'filePath': filePath // TODO: specify w/ @Alex what the value of this should be
            }
        })
        return source_item
    })
    .catch(function(err) {
        throw new Error('Error in parsing (my)meta.yml' + err)
    })
}

function extractCpanfile(file, dir){
    return new Promise( function(resolve, reject) {
        child_process.exec('cpanm --showdeps ' + dir, function(err, stdout, stderr) {
            if (err || stderr) {
                reject(err || stderr)
            } else {
                return resolve(stdout)
            }
        })
    }).then(function(stdout){
        /** example stdout
        * --> Working on .
        * Configuring Furl-3.13 ... OK
        * Module::Build::Tiny~0.035
        * HTTP::Parser::XS~0.11
        * Socket
        * Scalar::Util
        * Encode
        * ...
        */
        var lines = stdout.split('\n')
        if (!lines[0].includes('--> Working on ')){
            throw new Error('Not sure if this is a well formed resp: ' + stdout)
        }

        // TODO: source item is hard to get with this method
        // FIGURE out how to do this
        // TO be honest, this information _can_ be retrieve through the other files or 
        // parsing other files so let's see
        source_item = {
            'id': null,
            'version': null
        }

        lines = lines.slice(2, lines.length).filter(line => line !== '')
        var dependencies = lines.map(function(dep) {
            return dep.split('~')
        }).map(function(dep){
            if (dep.length == 1) {
                return {
                    'id': dep[0],
                    'version': '', // TODO or null?
                    'full_path': dir
                }
            } else if (dep.length == 2) {
                return {
                    'id': dep[0],
                    'version': dep[1][0] == 'v' ? dep[1].slice(1, dep[1].length) : dep[1], // version can start with a 'v' 
                    'full_path': dir
                }
            } else {
                // TODO: is this proper error reporting format + what should we do here?
                throw new Error('Error in how dep is formmated') 
            }
        })
        source_item['dependencies'] = dependencies
        return source_item
    }).catch( function(err) {
        throw new Error('Error in parsing output of showdeps ' + err)
    })
}

function execMakefilepl(file, dir) {
    fileLoc = path.join(dir, file)
    return new Promise( function(resolve, reject) {
        child_process.exec('perl ' + fileLoc, function(err, stdout, stderr) {
            if (err || stderr ) {
                reject(err || stderr)
            } else {
                return resolve(stdout)
            }
        })
    })
}

function execBuildpl(file, dir){
    fileLoc = path.join(dir, file)
    return new Promise(function (resolve, reject) {
        child_process.exec('perl ' + fileLoc, function (err, stdout, stderr) {
            if (err || stderr) {
                reject(err || stderr)
            } else {
                return resolve(stdout)
            }
        })
    })
}

module.exports = {
    extractCpanfile : extractCpanfile,
    extractMetaFiles : extractMetaFiles
}