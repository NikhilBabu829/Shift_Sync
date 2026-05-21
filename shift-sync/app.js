// Express app factory — configures middleware, auth, and mounts routes
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
// Load environment variables from .env into process.env
require('dotenv').config()
const passport = require('passport')
// Local (email + password) strategy for manager login
const passportLocalStrategy = require('passport-local').Strategy
// Google OAuth 2.0 strategy (imported twice below — this alias is unused directly)
const google = require('passport-google-oauth20').Strategy
const bcrypt = require('bcryptjs')
const session = require('express-session')

// Route handlers
var indexRouter = require('./routes/index');
const APIRoutes = require('./routes/API')

var app = express();
const mongoose = require('mongoose')

const cors = require('cors')

// Named import of the same Google strategy used for staff OAuth login
const GoogleStrategy = require('passport-google-oauth20').Strategy

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Mongoose models needed by passport serialisation/deserialisation
const MANAGER = require('./models/manager')
const STAFF = require('./models/staff')

// Allow requests from the frontend origin with credentials (cookies/JWTs)
app.use(cors({
  origin : process.env.FRONTEND_URL || "http://localhost:5173",
  methods : ["GET", "POST"],
  credentials : true
}))

// Parse cookies so passport-session can read the session cookie
app.use(cookieParser());
// Server-side session store used by passport.session()
app.use(session({secret : process.env.PASSPORT_SECRET, resave : false, saveUninitialized : false}))
// Initialise passport and restore any existing session
app.use(passport.initialize())
app.use(passport.session())
// HTTP request logger in concise dev format
app.use(logger('dev'));
// Parse JSON request bodies
app.use(express.json());
// Parse URL-encoded form bodies
app.use(express.urlencoded({ extended: false }));
// Serve static assets from /public
app.use(express.static(path.join(__dirname, 'public')));

// All API endpoints are prefixed with /api
app.use("/api", APIRoutes)

// Establishes the MongoDB Atlas connection using the URI from env
async function mongoDbConnection(){
  await mongoose.connect(`mongodb+srv://${process.env.MONGODB_URI}`)
}

// Connect to MongoDB on startup; log any connection errors
mongoDbConnection().catch((err)=>{console.log(err)})

// Manager local strategy — verifies email and bcrypt-hashed password against the Manager collection
passport.use("manager-local", new passportLocalStrategy({ usernameField : 'email', passwordField : 'password'}, async (email, pass, done)=>{
  try{
    console.log("Entered the manager-local")
    // Look up manager by email
    const manager = await MANAGER.findOne({email : email})
    if(!manager){
      console.log("no user found")
      return done(null, false, {message : "Username is incorrect"})
    }
    console.log("user found")
    // Compare submitted password against stored hash
    const match  = await bcrypt.compare(pass, manager.password)
    if(!match){
      console.log("password incorrect")
      return done(null, false, {message : "Password is incorrect"})
    }
    console.log("everything good in the manager-local")
    return done(null, manager)
  }
  catch(err){
    console.log("inside the catch for manger-local")
    return done(err)
  }
}))

// Serialise user into the session — stores minimal identifiers to keep the cookie small
passport.serializeUser((entity, done)=>{
  if(entity.provider === "google"){
    // Google users carry their profile inline; no DB lookup required
    done(null, {google_id : entity.id, email : entity.emails[0].value, staffName : entity.displayName ,provider : true})
  }else{
    // Local users are identified by DB id + model name so deserialise can pick the right model
    done(null, {id : entity.id, type : entity.constructor.modelName})
  }
})

// Deserialise user from the session on every authenticated request
passport.deserializeUser(async (obj, done)=>{
  try{
    if(obj.provider){
      // Google OAuth users are auth'd via JWT, not sessions — pass through without blocking
      return done(null, obj)
    }else{
      // Resolve the correct Mongoose model (Manager vs Staff) from the stored type string
      const Model = obj.type === "Manager" ? MANAGER : STAFF
      const person = await Model.findById(obj.id)
      return done(null, person)
    }
  }
  catch(err){
    done(err)
  }
})

// Google OAuth strategy — forwards the raw Google profile plus OAuth tokens; account linking happens in the callback route
passport.use(new google({
    clientID : process.env.GOOGLE_CLIENT_ID,
    clientSecret : process.env.GOOGLE_CLIENT_SECRET,
    callbackURL : process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback : true
  },
  async (req, accessToken, refreshToken, profile, done)=>{
    // Attach tokens to the profile object so the redirectURI handler can persist them
    profile._accessToken = accessToken
    profile._refreshToken = refreshToken
    return done(null, profile)
  }
))

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
