'use strict'

// C library API
const ffi = require('ffi-napi');
let parserLib = ffi.Library("./parser/bin/libgpxparser.so", {
  "gpxFileToJSON": ["string", ["string"]],
  "validateGPXFile": ["bool", ["string", "string"]],
  "gpxComponentsToJSON": ["string", ["string"]],
  "otherDataListToJSON": ["string", ["string", "string"]]
});

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
  var array = JSON.parse(otherData);
  for (var obj of array){
    console.log(obj);
    //obj.name = obj.name.trim();
    //obj.value = obj.value.trim();
  }
  console.log(array);
  res.send(JSON.stringify(array));
});

app.listen(portNum);
console.log('Running app at localhost: ' + portNum);

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




