
function isAdmin(req, res, next) {
    // console.log('Session data:', req.session);
    // console.log('User data:', req.session.user);
    // console.log('Is admin?:', req.session.user?.is_admin);

   if (req.session.user && req.session.user.is_admin === true) {
    next();
} else {
    res.status(403).json({
        error: 'Access denied',
        debug: {
            hasSession: !!req.session,
            hasUser: !!req.session?.user,
            adminStatus: req.session?.user?.is_admin
        }
    });
}
}
module.exports = isAdmin