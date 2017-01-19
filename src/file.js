class File {
    constructor(url, from, config) {
        this.url = url;

    }

    load() {
        var that = this;
        return new Promise(function (resolve, reject) {
            try {
                mkdir(saveTo.substr(0, saveTo.lastIndexOf('/')));
            } catch (e) {
                console.warning(e);
            }
            request.get({url: encodeURI(url), gzip: false, headers: headers, encoding: null})
                .on('response', function (response) {
                    if (response.statusCode == 200) {
                        resolve(response);
                    } else {
                        reject(response);
                    }
                })
                .on('error', function (err) {
                    reject(err);
                })
                .on('end', function () {
                    setTimeout(function () {
                        resolve(-1);
                    }, 20);
                })
                .pipe(fs.createWriteStream(loadObj.saveTo))
        });
    }
}