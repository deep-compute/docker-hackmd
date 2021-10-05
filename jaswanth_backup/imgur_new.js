'use strict';
var imgur     = exports;
var request   = require('request');
var fs        = require('fs');
var urlParser = require('url');
var glob      = require('glob');

// The following client ID is tied to the
// registered 'node-imgur' app and is available
// here for public, anonymous usage via this node
// module only.
var IMGUR_CLIENT_ID    = process.env.IMGUR_CLIENT_ID || 'f0ea04148a54268';
var IMGUR_API_URL      = process.env.IMGUR_API_URL || 'https://api.imgur.com/3/';
var IMGUR_USERNAME     = null;
var IMGUR_PASSWORD     = null;
var IMGUR_ACCESS_TOKEN = null;
var IMGUR_MASHAPE_KEY  = process.env.IMGUR_MASHAPE_KEY;

// An IIFE that returns the OS-specific home directory
// as a location to optionally store the imgur client id
var DEFAULT_CLIENT_ID_PATH = (function() {
    var envHome = (process.platform === 'win32') ? 'USERPROFILE' : 'HOME';
    return process.env[envHome] + '/.imgur';
}());

imgur.VERSION = require('../package.json').version;


/**
 * Send a request to imgur's public API
 *
 * @param   {string}  operation - operation to perform; 'info' or 'upload'
 * @param   {mixed}   payload - image data
 * @returns {promise}
 */
imgur._imgurRequest = function (operation, payload, extraFormParams) {
    var form     = null;
    var options  = {
        uri:      IMGUR_API_URL,
        method:   null,
        encoding: 'utf8',
        json:     true
    };

    return new Promise((resolve, reject) => {
        if (!operation || typeof operation !== 'string' || ( !payload && operation !== ('credits' && 'search') ) ) {
            return reject('Invalid argument');
        }

        switch(operation) {
            case 'upload':
                options.method = 'POST';
                options.uri += 'image';
                break;
            case 'credits':
                options.method = 'GET';
                options.uri += 'credits';
                break;
            case 'info':
                options.method = 'GET';
                options.uri += 'image/' + payload;
                break;
            case 'album':
                options.method = 'GET';
                options.uri += 'album/' + payload;
                break;
            case 'createAlbum':
                options.method = 'POST';
                options.uri += 'album';
                break;
            case 'delete':
                options.method = 'DELETE';
                options.uri += 'image/' + payload;
                break;
            case 'search':
                options.method = 'GET';
                options.uri += '/gallery/search/' + payload;
                break;
            default:
                return reject(new Error('Invalid operation'));
        }

        imgur._getAuthorizationHeader()
            .then(function (authorizationHeader) {
                if(IMGUR_MASHAPE_KEY) {
                    options.headers = {
                        Authorization: authorizationHeader,
                        'X-Mashape-Key': IMGUR_MASHAPE_KEY
                    };
                } else {
                    options.headers = {
                        Authorization: authorizationHeader
                    };
                }

                var r = request(options, function (err, res, body) {
                    if (err) {
                        throw err
                    } else if (!body) {
                        throw 'Bad response';
                    } else if (!body.success) {
                        throw {status: body.status, message: body.data ? body.data.error : 'No body data response'};
                    } else {
                        return body;
                    }
                });

                if (operation === 'upload') {
                    form = r.form();
                    form.append('image', payload);

                    if (typeof extraFormParams === 'object') {
                        for (var param in extraFormParams) {
                            form.append(param, extraFormParams[param]);
                        }
                    }
                }
            })
            .then(function (data) {
                resolve(data);
            })
            .catch(function (err) {
                reject(err);
            });
    });
}

/**
 * Make a request, handling potential errors
 *
 * @param {object} options
 * @returns {promise}
 */
imgur._request = function (options) {
    return new Promise(function (resolve, reject) {
        request(options, function (err, res, body) {
            if (err) {
                return reject(err);
            } else {
                return resolve(res);
            }
        });
    });
}

/**
 * Get imgur access token using credentials
 *
 * @returns {promise}
 */
imgur._getAuthorizationHeader = function () {
        if (IMGUR_ACCESS_TOKEN) {
            return Promise.resolve('Bearer ' + IMGUR_ACCESS_TOKEN);
        } else if (IMGUR_USERNAME && IMGUR_PASSWORD) {
            var options = {
                uri:      'https://api.imgur.com/oauth2/authorize',
                method:   'GET',
                encoding: 'utf8',
                qs: {
                    client_id: IMGUR_CLIENT_ID,
                    response_type: 'token'
                }
            };
            return imgur._request(options).then(function (res) {
                var authorize_token = res.headers['set-cookie'][0].match('(^|;)[\s]*authorize_token=([^;]*)')[2];
                options.method = 'POST';
                options.json = true;
                options.form = {
                    username: IMGUR_USERNAME,
                    password: IMGUR_PASSWORD,
                    allow: authorize_token
                };
                options.headers = {
                    Cookie: 'authorize_token=' + authorize_token
                };
                return imgur._request(options).then(function (res) {
                    var location = res.headers.location;
                    var token = JSON.parse('{"' + decodeURI(location.slice(location.indexOf('#') + 1)).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');
                    IMGUR_ACCESS_TOKEN = token.access_token;
                    return 'Bearer ' + IMGUR_ACCESS_TOKEN;
                })
            });
        } else {
            return Promise.resolve('Client-ID ' + IMGUR_CLIENT_ID);
        }
}

/**
 * Set your credentials
 * @link https://api.imgur.com/#register
 * @param {string} username
 * @param {string} password
 * @param {string} clientId
 */
imgur.setCredentials = function (username, password, clientId) {
    if (clientId && typeof clientId === 'string') {
        IMGUR_CLIENT_ID = clientId;
    }
    if (username && typeof username === 'string') {
        IMGUR_USERNAME = username;
    }
    if (password && typeof password === 'string') {
        IMGUR_PASSWORD = password;
    }
}


/**
 * Attempt to load the client ID from disk
 * @param   {string}  path - path to file with client id
 * @returns {promise}
 */
imgur.loadClientId = function (path) {
    return new Promise(function (resolve, reject) {
        var clientId = null;

        path = path || DEFAULT_CLIENT_ID_PATH;

        fs.readFile(path, { encoding: 'utf8' }, function (err, data) {
            if (err) {
                return reject(err);
            }

            if (!data) {
                return reject(new Error('File is empty'));
            }

            return resolve(data);
        });
    });
}


/**
 * Attempt to save the client ID to disk
 * @param   {string} path - path to save the client id to
 * @returns {promise}
 */
imgur.saveClientId = function (clientId, path) {
    return new Promise(function(resolve, reject) {
        path = path || DEFAULT_CLIENT_ID_PATH;

        fs.writeFile(path, clientId, function (err) {
            if (err) {
                return reject(err);
            }

            return resolve();
        });
    });
}


/**
 * Attempt to remove a saved client ID from disk
 * NOTE: File remains but is emptied
 *
 * @param   {string} path - path to save the client id to
 * @returns {promise}
 */
imgur.clearClientId = function (path) {
    return imgur.saveClientId('', path);
}


/**
 * Set your client ID
 * @link https://api.imgur.com/#register
 * @param {string} clientId
 */
imgur.setClientId = function (clientId) {
    if (clientId && typeof clientId === 'string') {
        IMGUR_CLIENT_ID = clientId;
    }
}


/**
 * Get currently set client ID
 * @returns {string} client ID
 */
imgur.getClientId = function () {
    return IMGUR_CLIENT_ID;
}

/**
 * Set Imgur API URL
 * @link https://api.imgur.com/#register or https://imgur-apiv3.p.mashape.com
 * @param {string} URL - URL to make the API calls to imgur
 */
imgur.setAPIUrl = function(URL) {
    if(URL && typeof URL === 'string') {
        IMGUR_API_URL = URL;
    }
}

/**
 * Get Imgur API Url
 * @returns {string} API Url
 */
imgur.getAPIUrl = function() {
    return IMGUR_API_URL;
}

/**
 * Set Mashape Key
 * @link https://market.mashape.com/imgur/imgur-9
 * @param {string} mashapeKey
 */
imgur.setMashapeKey = function(mashapeKey) {
    if(mashapeKey && typeof mashapeKey === 'string') {
        IMGUR_MASHAPE_KEY = mashapeKey;
    }
}
/**
 * Get Mashape Key
 * @returns {string} Mashape Key
 */
imgur.getMashapeKey = function() {
    return IMGUR_MASHAPE_KEY;
}

/**
 * Delete image
 * @param {string} deletehash - deletehash of the image generated during upload
 * @returns {promise}
 */
imgur.deleteImage = function (deletehash) {
    if(!deletehash) {
        return Promise.reject('Missing deletehash');
    }

    return imgur._imgurRequest('delete', deletehash);
}

/**
 * Get image metadata
 * @param   {string}  id - unique image id
 * @returns {promise}
 */
imgur.getInfo = function (id) {
    if (!id) {
        return Promise.reject('Invalid image ID');
    }

    return imgur._imgurRequest('info', id);
}


/**
 * Create an album
 * @returns {promise}
 */
imgur.createAlbum = function () {
    return imgur._imgurRequest('createAlbum', 'dummy');
}


/**
 * Get album metadata
 * @param   {string}  id - unique album id
 * @returns {promise}
 */
imgur.getAlbumInfo = function (id) {
    if (!id) {
        return Promise.reject(new Error('Invalid album ID'))
    }
    return imgur._imgurRequest('album', id);
}

imgur.search = function(query, options) {
    var checkQuery = imgur.checkQuery(query);
    options = options || {};
    if(checkQuery.constructor === Error) {
        return Promise.reject(checkQuery);
    }
    else {
        var params = imgur.initSearchParams(query, options);
        return imgur._imgurRequest('search', params.queryStr)
            .then(function (json) {
                var copyOfParams = params;
                delete copyOfParams['queryStr'];
                return {data: json.data, params: copyOfParams};
            })
    }
}

imgur.checkQuery = function(query) {
    var errMsg;
    if(!query) {
        errMsg = new Error("Search requires a query. Try searching with a query (e.g cats).")
    }
    else if(typeof query != 'string') {
        errMsg = new Error("You did not pass a string as a query.")
    }
    else {
        errMsg = ''
    }
    return errMsg
}


imgur.initSearchParams = function(query, options) {
    var params = {sort: 'time', dateRange: 'all', page: '1'};

    for(var key in options) {
      if ( key == 'sort' || key == 'dateRange' || key == 'page' ) {
        params[key] = params[key] != options[key] ? options[key] : params[key];
      }
    }

    var queryStr = "";
    Object.keys(params).forEach(function(param) {
      queryStr += '/' + params[param];
    })
    queryStr += "?q=" + query;
    params['queryStr'] = queryStr;
    return params
}


/**
 * Upload an image file
 * @param   {string}  file - path to a binary image file
 * @param   {string=} albumId - the album id to upload to
 * @param   {string=} title - the title of the image
 * @param   {string=} description - the description of the image
 * @returns {promise}
 */
imgur.uploadFile = function (file, albumId, title, description) {
    var extraFormParams = {};

    if (typeof albumId === 'string' && albumId.length) {
        extraFormParams.album = albumId;
    }

    if (typeof title === 'string' && title.length) {
        extraFormParams.title = title;
    }

    if (typeof description === 'string' && description.length) {
        extraFormParams.description = description;
    }
    return new Promise(function (resolve, reject) {
        glob(file, function (err, files) {
            if (err) {
                return eject(err);
            } else if (!files.length) {
                return reject(new Error('Invalid file or glob'));
            }

            files.forEach(function (f, index, arr) {
                var readStream = fs.createReadStream(f);
                readStream.on('error', reject);

                imgur._imgurRequest('upload', readStream, extraFormParams)
                    .then(function (json) {
                        return resolve(json);
                    })
                    .catch(function (err) {
                        return reject(err);
                    });
            });
        });
    })
}


/**
 * Upload a url
 * @param   {string}  url - address to an image on the web
 * @param   {string=} albumId - the album id to upload to
 * @param   {string=} title - the title of the image
 * @param   {string=} description - the description of the image
 * @returns {promise}
 */
imgur.uploadUrl = function (url, albumId, title, description) {
    var extraFormParams = {};

    if (typeof albumId === 'string' && albumId.length) {
        extraFormParams.album = albumId;
    }

    if (typeof title === 'string' && title.length) {
        extraFormParams.title = title;
    }

    if (typeof description === 'string' && description.length) {
        extraFormParams.description = description;
    }

    if (!url || !urlParser.parse(url).protocol) {
        return Promise.reject(new Error('Invalid URL'));
    }

    return imgur._imgurRequest('upload', url, extraFormParams);
}


/**
 * Upload a Base64-encoded string
 * @link http://en.wikipedia.org/wiki/Base64
 * @param   {string} base64 - a base-64 encoded string
 * @param   {string=} albumId - the album id to upload to
 * @param   {string=} title - the title of the image
 * @param   {string=} description - the description of the image
 * @returns {promise} - on resolve, returns the resulting image object from imgur
 */
imgur.uploadBase64 = function (base64, albumId, title, description) {
    var extraFormParams = {};

    if (typeof albumId === 'string' && albumId.length) {
        extraFormParams.album = albumId;
    }

    if (typeof title === 'string' && title.length) {
        extraFormParams.title = title;
    }

    if (typeof description === 'string' && description.length) {
        extraFormParams.description = description;
    }

    if (typeof base64 !== 'string' || !base64 || !base64.length) {
        return Promise.reject(new Error('Invalid Base64 input'));
    }

    return imgur._imgurRequest('upload', base64, extraFormParams);
}

/**
 * Upload an entire album of images
 * @param   {Array} images - array of image strings of desired type
 * @param   {string} uploadType - the type of the upload ('File', 'Url', 'Base64')
 * @param   {boolean=} failSafe - if true, it won't fail on invalid or empty image input and will return an object with empty album data and an empty image array
 * @returns {promise} - on resolve, returns an object with the album data and and an array of image data objects {data: {...}, images: [{...}, ...]}
 */
imgur.uploadAlbum = function (images, uploadType, failSafe) {
    if (!images || !images.length || !(typeof images === 'string' || images instanceof Array)) {
        if (failSafe) {
            return Promise.resolve({data: {}, images: []});
        } else {
            return Promise.reject(new Error('Invalid image input, only arrays supported'));
        }
    }

    return imgur.createAlbum()
        .then(function(album) {
            return imgur.uploadImages(images, uploadType, album.data.id)
                .then(function (images) {
                    return {data: album.data, images: images}
                })
        });
}

/**
 * Upload an entire album of images
 * @param {Array} images  - array of image strings of desired type
 * @param {string} uploadType - the type of the upload ('File', 'Url', 'Base64')
 * @param {string=} albumId - the album id to upload to
 * @returns {promise} - on resolve, returns an array of image data objects {album: {...}, images: [{...}, ...]}
 */
imgur.uploadImages = function (images, uploadType, albumId) {
    var upload = imgur['upload' + uploadType];

    if (!images || !images.length || !(typeof images === 'string' || images instanceof Array)) {
        return Promise.reject(new Error('Invalid image input, only arrays supported'));
    }

    return Promise.all(images.map(function (image) {
        return upload(image, albumId)
            .then(function (resultImage) {
                return resultImage.data;
            })
    }));
}



/**
 * Get current credit limits
 * @returns {promise}
 */
imgur.getCredits = function () {
    return imgur._imgurRequest('credits');
}
