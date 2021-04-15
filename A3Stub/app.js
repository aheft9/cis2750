'use strict'

// C library API
const ffi = require('ffi-napi');
const mysql = require('mysql2/promise');
let parserLib = ffi.Library("./parser/bin/libgpxparser.so", {
  "gpxFileToJSON": ["string", ["string"]],
  "validateGPXFile": ["bool", ["string", "string"]],
  "gpxComponentsToJSON": ["string", ["string"]],
  "otherDataListToJSON": ["string", ["string", "string"]],
  "changeName": ["bool", ["string", "string", "string"]],
  "routesFromFileToJson": ["string", ["string"]],
  "waypointsFromFileToJson": ["string", ["string", "string"]],
  "addRouteToDoc": ["bool", ["string", "string"]],
  "addWaypointToRoute": ["bool", ["string", "string", "string"]]
});
let connection;

// Express App (Routes)
const express = require("express");
const app     = express();
const path    = require("path");
const fileUpload = require('express-fileupload');

app.use(fileUpload());
app.use(express.static(path.join(__dirname+'/uploads')));

// Minimization
const fs = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { stringify } = require('querystring');

// Important, pass in port as in `npm run dev 1234`, do not change
const portNum = process.argv[2];

// Send HTML at root, do not change
app.get('/',function(req,res){
  res.sendFile(path.join(__dirname+'/public/index.html'));
});

// Send Style, do not change
app.get('/style.css',function(req,res){
  //Feel free to change the contents of style.css to prettify your Web app
  res.sendFile(path.join(__dirname+'/public/style.css'));
});

// Send obfuscated JS, do not change
app.get('/index.js',function(req,res){
  fs.readFile(path.join(__dirname+'/public/index.js'), 'utf8', function(err, contents) {
    const minimizedContents = JavaScriptObfuscator.obfuscate(contents, {compact: true, controlFlowFlattening: true});
    res.contentType('application/javascript');
    res.send(minimizedContents._obfuscatedCode);
  });
});

//Respond to POST requests that upload files to uploads/ directory
app.post('/upload', function(req, res) {
  if(!req.files) {
    return res.status(400).send('No files were uploaded.');
  }
 
  let uploadFile = req.files.uploadFile;
 
  // Use the mv() method to place the file somewhere on your server
  uploadFile.mv('uploads/' + uploadFile.name, function(err) {
    if(err) {
      return res.status(500).send(err);
    }

    res.redirect('/');
  });
});

//Respond to GET requests for files in the uploads/ directory
app.get('/uploads/:name', function(req , res){
  fs.stat('uploads/' + req.params.name, function(err, stat) {
    if(err == null) {
      res.sendFile(path.join(__dirname+'/uploads/' + req.params.name));
    } else {
      console.log('Error in file downloading route: '+err);
      res.send('');
    }
  });
});

//******************** Your code goes here ******************** 




app.get('/filelogdata', function(req, res){
  var jsonArray = getFileLogPanelData();
  console.log(jsonArray);
  res.send({
    jsondata : jsonArray
  });
});

//Sample endpoint
app.get('/endpoint1', function(req , res){
  let retStr = req.query.stuff + " " + req.query.junk;
  res.send({
    stuff: retStr
  });
});

app.get('/getFilenames', function(req, res){
  var arrayOfFilenames = [];
  var pathToFiles = path.join(__dirname + "/uploads/");
  var arrayOfFilenames = [];
  arrayOfFilenames = fs.readdirSync(pathToFiles);
  console.log(arrayOfFilenames);
  res.send({
    filenames : JSON.stringify(arrayOfFilenames)
  });
});

app.get('/getGPXViewPanel', function(req, res){
  var filename = "./uploads/"+req.query.filename;
  var array = parserLib.gpxComponentsToJSON(filename);
  console.log(array);
  res.send(array);
});

app.get('/getOtherData', function(req, res){
  var filename = "./uploads/"+req.query.filename;
  var compName = req.query.compName;
  console.log(compName);
  var otherData = parserLib.otherDataListToJSON(filename, compName);
  console.log(otherData);
  res.send(otherData);
});

app.get('/changeComponentName', function(req, res){
  var filename = "./uploads/"+req.query.filename;
  var compName = req.query.compName;
  var newName = req.query.nName;
  var changeName = parserLib.changeName(filename, compName, newName);
  res.send(changeName);
});

app.get('/login', async function(req, res){
  var username = req.query.username;
  var password = req.query.password;
  var database = req.query.database;
  var host = req.query.host;
  try{
    connection = await mysql.createConnection({
      user : username,
      password : password,
      database : database,
      host : host
    });
    await createTables();
    if (connection == undefined){
      console.log("Connection undefined 1");
    }
    res.send(true);
  }
  catch(e){
    res.send(false);
  }
});

app.get('/populateToTables', async function(req, res){
  console.log("Populating tables");
  if (connection == undefined){
    console.log("Connection undefined 2");
  }
  var pathToFiles = path.join(__dirname + "/uploads/");
  var files = fs.readdirSync(pathToFiles);
  var schemaFile = getSchemaFile();
  for (var file of files){
    console.log(file);
    var checker = await checkIfFile(file);
    if (checker == true){
      console.log("File is already in table.");
      continue;
    }
    if (parserLib.validateGPXFile("./uploads/" + file, schemaFile) == false){
      console.log("File is invalid");
      continue;
    }
    var json = parserLib.gpxFileToJSON("./uploads/" + file);
    console.log(json);
    var sql = fileJsonToSql(json);
    console.log(sql);
    await connection.execute(sql);
    var routeArray = parserLib.routesFromFileToJson("./uploads/" + file);
    routeArray = JSON.parse(routeArray);
    var [rows, columns] = await connection.execute(`SELECT gpx_id FROM FILE WHERE file_name = \"${file}\";`);
    console.log(rows);
    var gpxId = rows[0].gpx_id;
    for (var route of routeArray){
      console.log(route);
      sql = routeToSql(route, gpxId);
      await connection.execute(sql);
      var waypointArray = parserLib.waypointsFromFileToJson("./uploads/"+file, route.name);
      waypointArray = JSON.parse(waypointArray);
      var [rows1, fields1] = await connection.execute(`SELECT route_id FROM ROUTE WHERE route_name = \"${route.name}\";`);
      console.log(rows1[0].route_id);
      for (var waypoint of waypointArray){
        sql = waypointToSql(waypoint, rows1[0].route_id);
        await connection.execute(sql);
      }
    }
  }
});

app.get('/clearTables', async function(req, res){
  var returnObj = {
    message : null
  }
  try{
    await connection.execute(`DELETE FROM POINT;`);
    await connection.execute(`DELETE FROM ROUTE;`);
    await connection.execute(`DELETE FROM FILE;`);
    returnObj.message = `SUCCESSFULLY CLEARED TABLES;`;
  }
  catch(e){
    returnObj.message = `FAILED TO CLEAR TABLES;`;
  }
  finally{
    res.send(returnObj);
  }
});

app.get('/displayTables', async function(req, res){
  var returnObj = {
    message : null
  }
  try{
    var [rows, fields] = await connection.execute(`SELECT COUNT(*) AS numFiles FROM FILE;`);
    var [rows1, fields1] = await connection.execute(`SELECT COUNT(*) AS numRoutes FROM ROUTE;`);
    var [rows2, fields2] = await connection.execute(`SELECT COUNT(*) AS numPoints FROM POINT;`);
    returnObj.message = `DATABASE HAS ${rows[0].numFiles} FILES, ${rows1[0].numRoutes} ROUTES, AND ${rows2[0].numPoints} POINTS;`;
  }
  catch(e){
    returnObj.message = `FAILED TO DISPLAY DATABASE;`;
  }
  finally{
    res.send(returnObj);
  }
});

app.get('/addRoute', async function(req, res){
  var returnObj = {
    message : null
  }
  try{
    var filename = req.query.filename;
    var routeName = req.query.routeName;
    var lat = req.query.lat;
    var lon = req.query.lon;
    console.log(filename);
    console.log(routeName);
    console.log(lat);
    console.log(lon);
    var addedRoute = parserLib.addRouteToDoc("./uploads/"+filename, routeName);
    console.log(addedRoute);
  }
  catch(e){

  }
});

app.listen(portNum);
console.log('Running app at localhost: ' + portNum);

async function checkIfFile(filename){
  var [rows, fields] = await connection.execute(`SELECT file_name FROM FILE;`);
  for (var row of rows){
    if (row.file_name == filename){
      return true;
    }
  }
  return false;
}

async function createTables(){
  await connection.execute(`CREATE TABLE IF NOT EXISTS FILE(gpx_id INT AUTO_INCREMENT PRIMARY KEY, file_name VARCHAR(60) NOT NULL, ver DECIMAL(2,1) NOT NULL, creator VARCHAR(256) NOT NULL);`);
  await connection.execute(`CREATE TABLE IF NOT EXISTS ROUTE(route_id INT AUTO_INCREMENT PRIMARY KEY, route_name VARCHAR(256), route_len FLOAT(15,7) NOT NULL, gpx_id INT NOT NULL, FOREIGN KEY(gpx_id) REFERENCES FILE(gpx_id) ON DELETE CASCADE);`);
  await connection.execute(`CREATE TABLE IF NOT EXISTS POINT(point_id INT AUTO_INCREMENT PRIMARY KEY, point_index INT NOT NULL, latitude DECIMAL(11,7) NOT NULL, longitude DECIMAL(11,7) NOT NULL, point_name VARCHAR(256), route_id INT NOT NULL, FOREIGN KEY(route_id) REFERENCES ROUTE(route_id) ON DELETE CASCADE);`);
}

function getSchemaFile(){
  var dirPath = path.join(__dirname + "/uploads/");
  var files = fs.readdirSync(dirPath);
  for (var file of files){
    if (file.includes(".xsd") == true){
      return "./uploads/" + file;
    }
  }
  return null;
}

function fileJsonToSql(json){
  var headers = `(file_name, ver, creator)`;
  var fileObj = JSON.parse(json);
  var values =  `(\"${fileObj.fn.replace("./uploads/", "")}\", ${fileObj.version}, \"${fileObj.creator}\")`;
  var sql = `INSERT INTO FILE ${headers} VALUES ${values};`;
  return sql;
}

function routeToSql(route, gpx_id){
  var headers = `(route_name, route_len, gpx_id)`;
  if (route.name.includes("Unnamed")){
    route.name = null;
  }
  var values;
  if (route.name == null){
    values = `(${route.name}, ${route.len}, ${gpx_id})`;
  }
  else{
    values = `(\"${route.name}\", ${route.len}, ${gpx_id})`;
  }
  var sql = `INSERT INTO ROUTE ${headers} VALUES ${values};`;
  return sql;
}

function waypointToSql(waypoint, route_id){
  var headers = `(point_index, latitude, longitude, point_name, route_id)`;
  var values = `(${waypoint.index}, ${waypoint.lat}, ${waypoint.lon}, \"${waypoint.name}\", ${route_id})`;
  var sql = `INSERT INTO POINT ${headers} VALUES ${values};`;
  return sql;
}

function getFileLogPanelData(){
  var pathToFiles = path.join(__dirname + "/uploads/");
  var arrayOfFilenames = [];
  arrayOfFilenames = fs.readdirSync(pathToFiles);
  var jsonArray = [];
  for (var filename of arrayOfFilenames){
    var newPath = "./uploads/"+filename;
    var json = parserLib.gpxFileToJSON(newPath);
    if (json!="{}"){
      jsonArray.push(json);
    }
  }
  return JSON.stringify(jsonArray);
}




