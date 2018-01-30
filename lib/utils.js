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
// [source_item]

var path = require('path')
var _ = require('underscore')
var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))
var yaml = require('js-yaml');

function extractMetaList(file, dir){
    var fileLocation = path.join(dir, file)
    switch (file.toLowerCase()) {
        case 'meta.json': // fall-through
        case 'mymeta.json':
            return extractmymetajson(fileLocation)
            break;
        case 'meta.yml': // fall-through
        case 'mymeta.yml':
            return extractmymetayml(fileLocation)
            break;
        case 'cpanfile':
            break;
        case 'makefile.pl':
            break;
        case 'build.pl':
            break;
        default:
            console.log('File is not one we expected: ' + file)
            break;
    }
    // after getting the information from the extractor functions, 
    // triage it so that we can resolve differing versions and names
}

// TODO: move all the extractors to another file
function extractmymetajson(filePath){
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
                'version': dependencies[dep],
                'filePath': filePath // TODO: specify w/ @Alex what the value of this should be
            }
        })
        return source_item
    })
    .catch(function(err){
        throw new Error('Error in parsing (my)meta.json: ' + err)
    })
}

function extractmymetayml(filePath) {
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
                'version': dependencies[dep],
                'filePath': filePath // TODO: specify w/ @Alex what the value of this should be
            }
        })
        return source_item

    })
    .catch(function(err) {
        throw new Error('Error in parsing (my)meta.yml' + err)
    })
}

function extractcpanfile(file, dir){
    
}

function extractmakefilepl(file, dir){
}

function extractbuildpl(file, dir){
}