var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
require('dotenv').config()
const passport = require('passport')
const passportLocalStrategy = require('passport-local').Strategy
const bcrypt = require('bcryptjs')
const session = require('express-session')

var indexRouter = require('./routes/index');
const APIRoutes = require('./routes/API')

var app = express();

const mongoose = require('mongoose')

const GoogleStrategy = require('passport-google-oauth20').Strategy

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

const MANAGER = require('./models/manager')
const STAFF = require('./models/staff')

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({secret : process.env.PASSPORT_SECRET, resave : false, saveUninitialized : false}))
app.use(passport.session())

app.use('/', indexRouter);
app.use("/api", APIRoutes)

async function mongoDbConnection(){
  await mongoose.connect(`mongodb+srv://${process.env.MONGODB_URI}`)
}

mongoDbConnection().catch((err)=>{console.log(err)})

passport.use("manager-local", new passportLocalStrategy({ usernameField : 'email', passwordField : 'password'}, async (email, pass, done)=>{
  try{
    const manager = await MANAGER.findOne({email : email})
    if(!manager){
      return done(null, false, {message : "Username is incorrect"})
    }
    const match  = await bcrypt.compare(pass, manager.password)
    if(!match){
      return done(null, false, {message : "Password is incorrect"})
    }
    return done(null, manager)
  }
  catch(err){
    return done(err)
  }
}))

passport.serializeUser((entity, done)=>{
  done(null, {id : entity.id, type : entity.constructor.modelName})
})

passport.deserializeUser(async (obj, done)=>{
  try{
    const Model = obj.type === "Manager" ? MANAGER : STAFF
    const person = await Model.findById(obj.id)
    return done(null, person)
  }
  catch(err){
    done(err)
  }
})

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
