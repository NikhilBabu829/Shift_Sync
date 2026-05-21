var express = require('express');
var router = express.Router();

/* GET home page — renders the default EJS index view. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
