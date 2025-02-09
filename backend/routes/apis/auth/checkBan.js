const express = require('express');
const router = express.Router();

router.get('/check-ban', (req, res) => {
    if (req.session.user.is_banned == 1) {
      // User is banned, render the banned page
      res.render('banned');
    } else {
      // User is not banned, proceed with the normal route or redirect to another page
      res.send('You are not banned.');
    }
  });
  module.exports = router;