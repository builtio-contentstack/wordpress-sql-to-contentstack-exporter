/**
 * External module Dependencies.
 */
var mkdirp    = require('mkdirp'),
    path      = require('path'),
    fs = require('fs'),
    when      = require('when'),
    guard = require('when/guard'),
    parallel = require('when/parallel');


/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');

var categoryConfig = config.modules.categories,
    categoryids=[],
    categoryFolderPath = path.resolve(config.data, config.entryfolder,categoryConfig.dirName),
    masterFolderPath = path.resolve(config.data, 'master',config.entryfolder);

/**
 * Create folders and files
 */
 if (!fs.existsSync(categoryFolderPath)) {
mkdirp.sync(categoryFolderPath);
helper.writeFile(path.join(categoryFolderPath,  categoryConfig.fileName))
mkdirp.sync(masterFolderPath);
helper.writeFile(path.join(masterFolderPath, categoryConfig.masterfile),'{"en-us":{}}')
}


function ExtractCategories(){
    this.connection=helper.connect();
}

ExtractCategories.prototype = {
    putCategories: function(categorydetails){
        return when.promise(function(resolve, reject) {
            var slugRegExp = new RegExp("[^a-z0-9_-]+", "g");
            var categorydata = helper.readFile(path.join(categoryFolderPath, categoryConfig.fileName));
            var categorymaster =helper.readFile(path.join(masterFolderPath, categoryConfig.masterfile));
            var catslugmapping={}
            categorydetails.map(function (data, index) {
                var title = data["name"];
                title=title.replace(/&amp;/g, '&')
                var id=data["ID"];
                var slug=data["slug"]
                var description=data["description"]
                if(description) {
                    description = description.replace(/&amp;/g, '&')
                }
                var parent=data["parent"]
                catslugmapping[id]=slug

                if(parent!=0){
                    var parentslug=catslugmapping[parent]
                    parent=[parentslug];
                }else{
                    parent=[""];
                }
                var url = "/category/" + slug.toLowerCase().replace(slugRegExp, '-');
                categorydata[slug] = {"id":id,"title": title, "url": url, "description":description, "parent":parent}
                categorymaster["en-us"][slug]=""
                successLogger("exported categories " +"'"+id+"'");
            })
            helper.writeFile(path.join(categoryFolderPath, categoryConfig.fileName), JSON.stringify(categorydata, null, 4))
            helper.writeFile(path.join(masterFolderPath, categoryConfig.masterfile), JSON.stringify(categorymaster, null, 4))
            resolve();
        })
    },
    getCategories: function(skip){
        var self = this;
        return when.promise(function(resolve, reject){
            var query;
            if(categoryids.length==0){
                query = config["mysql-query"]["categories"];   //Query for all categories
            }
            else{
                query = config["mysql-query"]["categoriesByID"]; //Query for caegories by id
                query=query.replace("<<catids>>","("+categoryids+")")
            }
            query = query.replace(/<<tableprefix>>/g, config["table_prefix"]);
            query = query + " limit " + skip + ",100";
            self.connection.query(query, function (error, rows, fields) {
                if (!error) {
                    if (rows.length > 0) {
                        self.putCategories(rows)
                    }
                    resolve()
                } else {
                    errorLogger("error while exporting categories:", query);
                    resolve(error);
                }
            })
        })
    },
    getCategoriesIteration: function(categorycount){
        var self = this;
        return when.promise(function(resolve, reject){
            var _getCategories = [];
            for (var i = 0, total = categorycount; i < total; i+=100) {
                _getCategories.push(function(data) {
                    return function() {
                        return self.getCategories(data);
                    };
                }(i));
            }
            var guardTask = guard.bind(null, guard.n(1));
            _getCategories = _getCategories.map(guardTask);
            var taskResults = parallel(_getCategories);
            taskResults
                .then(function(results) {
                    self.connection.end();
                    resolve();
                })
                .catch(function(e) {
                    errorLogger("something wrong while exporting categories:",e);
                    reject(e);
                })
        })
    },
    start: function () {
        successLogger("exporting categories...");
        var self = this;
        return when.promise(function(resolve, reject) {
            if(!filePath) {
                var count_query = config["mysql-query"]["categoriesCount"];
                count_query = count_query.replace(/<<tableprefix>>/g, config["table_prefix"]);
                self.connection.query(count_query, function (error, rows, fields) {
                    if (!error) {
                        var categorycount = rows[0]["categorycount"];
                        if (categorycount > 0) {
                            self.getCategoriesIteration(categorycount)
                            resolve()
                        } else {
                            errorLogger("no categories found");
                            self.connection.end();
                            resolve();
                        }
                    } else {
                        errorLogger('failed to get categories count: ', error);
                        self.connection.end();
                        reject(error)
                    }
                })
            }else{
                if(fs.existsSync(filePath)){
                    categoryids=(fs.readFileSync(filePath, 'utf-8')).split(",");
                }
                if(categoryids.length>0){
                    self.getCategoriesIteration(categoryids.length)
                }
                resolve();
            }
        })


    }
}


module.exports = ExtractCategories;