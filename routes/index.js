var express = require('express');
var router = express.Router();
const auth = require('./auth');

/* GET home page. */
router.get('/', (req, res)=> {
  let msg;
  if(req.query.msg == "1") msg = "帳戶已經刪除";
  else if(req.query.msg == "2") msg = "個人資料不存在";
  else if(req.query.msg == "3") msg = "新帳戶成功創立";
  res.render('index',{pop:msg});

}).get('/logout', auth.islogin, (req, res) => {
  req.logout((err)=>{
    res.redirect("/");
  })
}).get('/*', (req, res) => {
  //for other sites, redirect to the index page.
  res.redirect('/');
});

module.exports = router;
