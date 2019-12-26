/**
 * External module Dependencies.
 */
var mkdirp      = require('mkdirp'),
    path        = require('path'),
    fs          = require('fs'),
    when        = require('when'),
    guard       = require('when/guard'),
    parallel    = require('when/parallel');

/**
 * Internal module Dependencies.
 */
var helper      = require('../../libs/utils/helper.js');

var postConfig                  = config.modules.posts,
    permalink_structure         = "",
    siteurl                     = "",
    limit                       = 100,
    postids                     = [],
    postFolderPath              = path.resolve(config.data,config.entryfolder, postConfig.dirName),
    assetfolderpath             = path.resolve(config.data, config.modules.asset.dirName),
    masterFolderPath            = path.resolve(config.data, 'master',config.entryfolder),
    postsCountQuery             = "SELECT count(p.ID) as postcount FROM <<tableprefix>>posts p WHERE p.post_type='post' AND p.post_status='publish'",
    postsQuery                  = "SELECT p.ID,p.post_author,u.user_login,p.post_title,p.post_name,p.guid,p.post_content,p.post_date,p.post_date_gmt, (SELECT group_concat(<<tableprefix>>terms.slug) FROM <<tableprefix>>terms INNER JOIN <<tableprefix>>term_taxonomy on <<tableprefix>>terms.term_id = <<tableprefix>>term_taxonomy.term_id INNER JOIN <<tableprefix>>term_relationships wpr on wpr.term_taxonomy_id = <<tableprefix>>term_taxonomy.term_taxonomy_id WHERE taxonomy= 'category' and p.ID = wpr.object_id)AS post_category,p.post_author,u.user_login FROM <<tableprefix>>posts p LEFT JOIN <<tableprefix>>users u ON u.ID = p.post_author WHERE p.post_type='post' AND p.post_status='publish' GROUP BY p.ID ORDER BY p.post_date asc",
    postsByIDQuery              = "SELECT p.ID,p.post_author,u.user_login,p.post_title,p.post_name,p.guid,p.post_content,p.post_date,p.post_date_gmt, (SELECT group_concat(<<tableprefix>>terms.slug) FROM <<tableprefix>>terms INNER JOIN <<tableprefix>>term_taxonomy on <<tableprefix>>terms.term_id = <<tableprefix>>term_taxonomy.term_id INNER JOIN <<tableprefix>>term_relationships wpr on wpr.term_taxonomy_id = <<tableprefix>>term_taxonomy.term_taxonomy_id WHERE taxonomy= 'category' and p.ID = wpr.object_id)AS post_category,p.post_author,u.user_login FROM <<tableprefix>>posts p LEFT JOIN <<tableprefix>>users u ON u.ID = p.post_author WHERE p.post_type='post' AND p.post_status='publish' AND p.ID IN <<postids>> GROUP BY p.ID ORDER BY p.post_date asc",
    permalink_structureQuery    = "SELECT option_value FROM <<tableprefix>>options WHERE option_name='permalink_structure'",
    siteURLQuery                = "SELECT option_value FROM <<tableprefix>>options WHERE option_name='siteurl'";


mkdirp.sync(postFolderPath);
helper.writeFile(path.join(postFolderPath,  postConfig.fileName))
mkdirp.sync(masterFolderPath);
helper.writeFile(path.join(masterFolderPath, postConfig.masterfile),'{"en-us":{}}')

function ExtractPosts(){
    this.connection=helper.connect();
    //Get the detail of permalink and siteurl
    var permalinkquery=permalink_structureQuery;
    permalinkquery=permalinkquery.replace(/<<tableprefix>>/g,config["table_prefix"])
    this.connection.query(permalinkquery, function(error, rows, fields) {
        if(!error){
            if(rows[0]['option_value']&&rows[0]['option_value']!="")
                permalink_structure=rows[0]['option_value'];
        }
    })
    var siteurlquery=siteURLQuery;
    siteurlquery=siteurlquery.replace(/<<tableprefix>>/g,config["table_prefix"])
    this.connection.query(siteurlquery, function(error, rows, fields) {
        if(!error){
            siteurl=rows[0]['option_value']
        }
    })

}

ExtractPosts.prototype = {
    getURL: function(post, guid,permalink_structure){
        var lastslash=false;
        if(permalink_structure==""){
            //This code for handle guid and  blog host from it
            var base= siteurl.split("/");;
            var len=base.length;
            var blogname;
            if(base[len-1]==""){
                blogname=base[len-2]
            }else{
                blogname=base[len-1]
            }
            console.log(blogname)
            var url=guid;
            var index=url.indexOf(blogname);
            url=url.split(blogname)
            url=url[1];
            return url
        }else{
            permalink_structure=permalink_structure.split("/");
            if(permalink_structure[0]=="")
                permalink_structure.splice(0,1)

            var len=permalink_structure.length;
            if(permalink_structure[len-1]==""){
                lastslash=true;
                permalink_structure.splice((len-1),1)
            }
            var posturl="";

            permalink_structure.map(function (structure, index) {
                var date=new Date(post["post_date_gmt"])
                if(structure=="%post_id%"){
                    if(posturl.indexOf("/")==0)
                        posturl=posturl+post["ID"]+"/"
                    else
                        posturl=posturl+"/"+post["ID"]+"/";
                }else if(structure=="%year%"){
                    if(posturl.indexOf("/")==0)
                        posturl=posturl+date.getFullYear()+"/"
                    else
                        posturl=posturl+"/"+date.getFullYear()+"/";
                }else if(structure=="%monthnum%"){
                    var month=date.getMonth()+1;
                    if(month<=9)
                        month="0"+month

                    if(posturl.indexOf("/")==0)
                        posturl=posturl+month+"/"
                    else
                        posturl=posturl+"/"+month+"/";
                }else if(structure=="%day%"){
                    var day=date.getDate();
                    if(day<=9)
                        day="0"+day;

                    if(posturl.indexOf("/")==0)
                        posturl=posturl+day+"/"
                    else
                        posturl=posturl+"/"+day+"/";
                }else if(structure=="%postname%"){
                    if(posturl.indexOf("/")==0)
                        posturl=posturl+post["post_name"]+"/"
                    else
                        posturl=posturl+"/"+post["post_name"]+"/";
                }else{
                    if(posturl.indexOf("/")==0)
                        posturl=posturl+structure+"/"
                    else
                        posturl=posturl+"/"+structure+"/";
                }
            })
            /*var index=posturl.lastIndexOf("/");
            posturl=posturl.substring(0,index)*/
            //above two commented lines to remoce last slash from url if we don't want
            if(!lastslash){
                //this condition is to check wheather url structure having last slash or not
                //posturl=siteurl+posturl
                return posturl
            }
            //return siteurl+posturl  //send absolute url of post
            return posturl  //only relative url will be save
        }
    },
    savePosts: function(postsDetails){
        var self = this;
        return when.promise(function(resolve, reject) {
            var postdata = helper.readFile(path.join(postFolderPath, postConfig.fileName));
            var postmaster =helper.readFile(path.join(masterFolderPath, postConfig.masterfile));
            var featuredImage=helper.readFile(path.join(assetfolderpath, config.modules.asset.featuredfileName));
            postsDetails.map(function (data, index) {
                var guid="/"+data["guid"].replace(/^(?:\/\/|[^\/]+)*\//, "");
                postdata[data["ID"]]={title:data["post_title"],url:self.getURL(data,guid,permalink_structure),author:data["user_login"].split(","),
                    date:data["post_date_gmt"].toISOString(),guid:guid,full_description:data["post_content"],uid:data["ID"]}
                if(data["post_category"]){
                    postdata[data["ID"]]["category"]=data["post_category"].split(",")
                }else{
                    postdata[data["ID"]]["category"]=[]
                }
                if(featuredImage)
                     postdata[data["ID"]]["featured_image"]=featuredImage[data["ID"]]
                postmaster["en-us"][data["ID"]]=""
                successLogger("exported post " + "'" + data["ID"] + "'");
            })
            helper.writeFile(path.join(postFolderPath, postConfig.fileName), JSON.stringify(postdata, null, 4))
            helper.writeFile(path.join(masterFolderPath, postConfig.masterfile), JSON.stringify(postmaster, null, 4))

            resolve()

        })
    },
    getPosts: function(skip) {
        var self = this;
        return when.promise(function(resolve, reject) {
            var query;
            if(postids.length==0)
                 query=postsQuery; //Query for all posts
            else{
                query = postsByIDQuery; //Query for posts by id
                query=query.replace("<<postids>>","("+postids+")")
            }
            query=query.replace(/<<tableprefix>>/g,config["table_prefix"]);
            query = query + " limit " + skip + ", "+ limit;
            self.connection.query(query, function(error, rows, fields) {
                if(!error){
                    if(rows.length>0){
                        self.savePosts(rows)
                        resolve();
                    }else{
                        errorLogger("no posts found");
                        resolve()
                    }
                }else{
                    errorLogger("error while exporting posts:", query)
                    resolve(error);
                }
            })
        })
    },
    getAllPosts: function(postCount){
        var self = this;
        return when.promise(function(resolve, reject){
            var _getPosts = [];
            for (var i = 0, total = postCount; i < total; i+=limit) {
                _getPosts.push(function(data) {
                    return function() {
                        return self.getPosts(data);
                    };
                }(i));
            }
            var guardTask = guard.bind(null, guard.n(1));
            _getPosts = _getPosts.map(guardTask);
            var taskResults = parallel(_getPosts);
            taskResults
                .then(function(results) {
                    self.connection.end();
                    resolve();
                })
                .catch(function(e) {
                    errorLogger("something wrong while exporting posts:",e);
                    reject(e);
                })
        })

    },
    start: function () {
        successLogger("exporting posts...");
        var self = this;
        return when.promise(function(resolve, reject) {
            if(!filePath) {
                var count_query = postsCountQuery;
                count_query = count_query.replace(/<<tableprefix>>/g, config["table_prefix"]);
                self.connection.query(count_query, function (error, rows, fields) {
                    if (!error) {
                        var postcount = rows[0]["postcount"];
                        if (postcount > 0) {
                            self.getAllPosts(postcount)
                            .then(function(){
                                resolve()
                            })
                            .catch(function(){
                                reject()
                            })
                        } else {
                            errorLogger("no posts found");
                            self.connection.end();
                            resolve();
                        }
                    } else {
                        errorLogger('failed to get posts count: ', error);
                        self.connection.end();
                        reject(error)
                    }
                })
            }else{
                if(fs.existsSync(filePath)){
                    postids=(fs.readFileSync(filePath, 'utf-8')).split(",");
                }
                if(postids.length>0){
                    self.getAllPosts(postids.length)
                    .then(function(){
                        resolve()
                    })
                    .catch(function(){
                        reject()
                    })
                }else{
                    resolve()
                }
            }
        })
    }
}

module.exports = ExtractPosts;