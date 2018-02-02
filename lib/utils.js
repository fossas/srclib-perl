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
            return execCpanmShowdeps(file, dir)
            .then(function(cpanMeta) {
                // take the information from the cpan stdout and combine it
                // with a META.json file if it was created
                return extractMetaFiles(dir).then(function (metainfo) {
                    return metainfo.concat(cpanMeta)
                })
            })
            break;
        case 'makefile.pl':
            return execMakefilepl(file, dir)
            // Technically here we can inspect the Make file to look for the source version
            .then(function getAllMeta(possibleCpanOut) {
                if (possibleCpanOut && typeof (possibleCpanOut) === 'object') {
                    var toRet = [possibleCpanOut]
                    return extractMetaFiles(dir).then(function (metainfo) {
                        return toRet.concat(metainfo)
                    })
                } else {
                    return extractMetaFiles(dir)
                }
            }).then( function (metainfo) {
                if (metainfo.length == 0) {
                    throw new Error('No meta.json files or cpan output were retrieved after running perl '+ file)
                } else {
                    return metainfo
                }
            })
            break;
        case 'build.pl':
            return execBuildpl(file, dir)
            // Technically here we can inspect the Build file to look for the source version
            .then(function getAllMeta(possibleCpanOut){
                if (possibleCpanOut && typeof (possibleCpanOut) === 'object') {
                    var toRet = [possibleCpanOut]
                    return extractMetaFiles(dir).then(function(metainfo){
                        return toRet.concat(metainfo)
                    })
                } else {
                    return extractMetaFiles(dir)
                }
            }).then(function (metainfo) {
                if (metainfo.length == 0) {
                    throw new Error('No meta.json files or cpan output were retrieved after running perl ' + file)
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
 * 
 * @return {[source_item]} an array of source items that we were able to gleam
 */
function extractMetaFiles(dir) {
    return glob.globAsync(path.join(dir, '*(MYMETA\.json|MYMETA\.yml|META\.json|META.yml)'), { nocase: true })
    .map(function(matchedFile) {
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
    })
}

function extractMyMetaJson(filePath){
    return fs.readFileAsync(filePath)
    .then(function (rawContent) {
        var content = JSON.parse(rawContent)
        // get name and version
        var source_item = {
            'id': content.name,
            'version': content.version,
            'filePath': path.dirname(filePath)
        }
        // TODO: mymeta can have multiple types of prereqs
        // for now, we only look at stuff under the runtime of prereqs key.
        // Need to explore what else is there ("prod" || "production" || "test")
        try {
            var dependencies = Object.keys(content.prereqs.runtime).map(function(runtimeType){
                return content.prereqs.runtime[runtimeType]
            }).reduce(function(a,b) {
                return Object.assign(a,b) // flatten out
            })
        } catch(err) {
            throw new Error(err)
        }
        source_item['dependencies'] = Object.keys(dependencies).map(function dependencyItemFormat(dep, idx) {
            return {
                'id': dep,
                'version': (dependencies[dep] === '0' || dependencies[dep] === 0) ? '' : dependencies[dep],
                'path': filePath
            }
        })
        return source_item
    })
    .catch(function(err){
        throw new Error('Error in parsing (my)meta.json: ' + err) // TODO : should we error out all of this if this fails?
    })
}

function extractMyMetaYml(filePath) {
    return fs.readFileAsync(filePath)
    .then(function (rawContents) {
        var content = yaml.safeLoad(rawContents)
        // get name and version of source
        var source_item = {
            'id': content.name,
            'version': content.version,
            'filePath': path.dirname(filePath)
        }
        // TODO: (my)meta can have multiple types of prereqs
        // for now, we only look at stuff under the runtime of prereqs key.
        // Need to explore what else is there ("prod" || "production" || "test")
        var dependencies = content.requires
        source_item['dependencies'] = Object.keys(dependencies).map(function dependencyItemFormat(dep, idx) {
            return {
                'id': dep,
                'version': (dependencies[dep] === '0' || dependencies[dep] === 0) ? '' : dependencies[dep], 
                'path': filePath 
            }
        })
        return source_item
    })
    .catch(function(err) {
        throw new Error('Error in parsing (my)meta.yml' + err)
    })
}

function execCpanmShowdeps(file, dir){
    return new Promise( function(resolve, reject) {
        child_process.exec('cpanm --showdeps -q ' + dir, function(err, stdout, stderr) {
            if (err || stderr) {
                // We don't need to error out, just console it
                // It is an issue however if mymeta and mymeta.yml are not made
                console.error(err || stderr)
                return null
            } else {
                return resolve(stdout)
            }
        })
    }).then(function(stdout){
        /** 
        * Module::Build::Tiny~0.035
        * HTTP::Parser::XS~0.11
        * Socket
        * Scalar::Util
        * Encode
        * ...
        */
        var lines = stdout.split('\n')

        // TODO: source item is hard to get with this method
        // You can get the version through /lib/<path or name of module>.pm. The version should be in format `our $VERSION <version>`
        source_item = {
            'id': null,
            'version': null,
            'filePath': path.dirname(path.join(dir, file))
        }

        lines = lines.filter(line => line !== '')
        var dependencies = lines.map(function(dep) {
            return dep.split('~') // TODO : check with other types of version restraints
        }).map(function(dep){
            if (dep.length === 1) {
                return {
                    'id': dep[0],
                    'version': '', // TODO or null?
                    'path': file
                }
            } else if (dep.length === 2) {
                var init_version = dep[1].replace(/\s/g, '') // remove whitespace
                return {
                    'id': dep[0],
                    // version can start with a 'v', can have spaces in it. We remove these but cpan doesn't mind sending that format in
                    'version': init_version[0] === 'v' ? init_version.slice(1, init_version.length) : init_version, 
                    'path': file
                }
            } else {
                // TODO: is this proper error reporting format, what should we do here?
                throw new Error('Error in how dep is formmated')  //
            }
        })
        source_item['dependencies'] = dependencies
        return source_item
    }).catch( function(err) {
        console.error('Error in parsing output of cpanm --showdeps ' + err) // TODO: should entire process fail if this fails
    })
}

function execMakefilepl(file, dir) {
    fileLoc = path.join(dir, file)
    return new Promise( function(resolve, reject) {
        child_process.exec('cd ' + dir + '; perl ' + fileLoc + '; cd -', function(err, stdout, stderr) {
            if (err || stderr ) {
                var examinedErr = err || stderr
                // don't care about some errors. the desired effect should still happen. Maybe we should remove this check and resolve everything
                if (examinedErr.includes('Cannot determine perl version') || 
                    examinedErr.includes('Cannot determine license info') ||
                    examinedErr.includes('not found') ||
                    examinedErr.includes('Warning:') ||
                    examinedErr.includes('is not installed') ) {
                        // console.warn(examinedErr) // just quietly fail
                        return resolve(stdout)
                } else {
                    // You can also do hard reject if there is no "MYMETA.yml and MYMETA.json" in the output
                    // but there are a few variations of those strings so not so sure if you want to do that.
                    reject(err || stderr)
                }
            } else {
                return resolve(stdout)
            }
        })
    }).then( function calloncpanm(stdout) {
        // you can do cpanm on makefiles too
        return execCpanmShowdeps(file, dir)
    })
}

function execBuildpl(file, dir){
    fileLoc = path.join(dir, file)
    return new Promise(function (resolve, reject) {
        child_process.exec('cd ' + dir + '; perl ' + fileLoc + '; cd -', function (err, stdout, stderr) {
            if (err || stderr) {
                // if it errors out, figure it out
                console.error(err || stderr) // just quietly fail
                return resolve(err)
            } else {
                return resolve(stdout)
            }
        })
    }).then(function calloncpanm(stdout){
        return execCpanmShowdeps(file, dir)
    })
}

module.exports = {
    execCpanmShowdeps : execCpanmShowdeps,
    extractMetaFiles : extractMetaFiles,
    extractMyMetaJson: extractMyMetaJson,
    extractMyMetaYml: extractMyMetaYml,
    extractMetaFromBuildList : extractMetaFromBuildList,
    execMakefilepl: execMakefilepl,
    execBuildpl: execBuildpl
}