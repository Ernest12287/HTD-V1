require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const cron = require('node-cron');
const path = require('path');
// const runMaintenanceCheck = require('./backend/routes/apis/deploymentApis/maintenance')
const {updateApiKeyStatus, checkApiKeyValidity} = require('./backend/routes/apis/apiStatus') 
const pool = require('./backend/database/sqlConnection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.json());  // For parsing JSON bodies
app.use(express.urlencoded({ extended: true }));  // For parsing URL-encoded bodies

// Session Configuration
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: true, // Expired sessions auto delete karega
    checkExpirationInterval: 900000, // 15 min me check karega
    expiration: 5 * 24 * 60 * 60 * 1000, // 5 din ke baad session delete hoga (auto)
});
app.use(session({
    key: 'talkdrove-session',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'development',
        maxAge: 5 * 24 * 60 * 60 * 1000 // 5 din (browser session expiry)
    }
}));

// Static Files and Views
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('public'));
// Set the views directory
app.set('views', path.join(__dirname, 'views'));
// Set the templating engine (e.g., EJS)
app.set('view engine', 'ejs');

// Importing all modules::::::: (routes)""""""""""""""""""""""
const dashboard = require('./backend/routes/dashboardRoutes');
const totalUsers = require('./backend/routes/apis/totalUsers')
const lander = require('./backend/routes/landerRoutes');
const moderator = require('./backend/routes/moderatorsRoutes');
const authRoutes = require('./backend/routes/authRoutes')
const admin = require('./backend/routes/adminRoutes')
const botDetails = require('./backend/routes/apis/userApis/apps/botDetails');
const subscribe = require('./backend/routes/apis/userApis/earnCoins/subscribeTalkDrove');

//Apiiiiiiiiis modules:

//Auth api routes modules:
const login = require('./backend/routes/apis/auth/login');
const resetPassword = require('./backend/routes/apis/auth/resetPassword');
const signup = require('./backend/routes/apis/auth/signup')
// const testMail = require('./backend/routes/apis/auth/testMail')
const { router } = require('./backend/routes/apis/auth/emailRoute')
const checkBan = require('./backend/routes/apis/auth/checkBan')
const checkUsername = require('./backend/routes/apis/auth/checkUsername')
const checkLogin = require('./backend/routes/apis/auth/checkLogin')
// Required user routes modules user-apps etc...
const userApps = require('./backend/routes/apis/userApis/apps/apps');
const userCoins = require('./backend/routes/apis/userApis/userCoins');
const claimCoins = require('./backend/routes/apis/userApis/claimCoins');
const logout = require('./backend/routes/apis/userApis/logout');
const countries = require('./backend/routes/apis/userApis/countries');
const invite = require('./backend/routes/apis/userApis/invite/invite');
const depositRequest = require('./backend/routes/apis/userApis/depositRequest');
const reportBots = require('./backend/routes/apis/userApis/reportBots');
const transferFromTalkDrove = require('./backend/routes/apis/userApis/transferFromTalkDrove');
const contactUs = require('./backend/routes/apis/userApis/contactUs');
const walletRoutes = require('./backend/routes/apis/userApis/walletRoutes');
const checkAppName = require('./backend/routes/apis/userApis/checkAppName');
const selectBot = require('./backend/routes/selectBot');
const prepareDeployment = require('./backend/routes/prepareDeployment');
const devices = require('./backend/routes/apis/devices')
const serverStats = require('./backend/routes/apis/serversStats')
//Importing deploy route
const deploy = require('./backend/routes/apis/deploymentApis/deploy')
//Importing botInfo routes
const appLogs = require('./backend/routes/apis/userApis/apps/appLogs')
const appTerminal = require('./backend/routes/apis/userApis/apps/appTerminal')
const deleteAppRoute = require('./backend/routes/apis/userApis/apps/deleteAppRoute')
const apps = require('./backend/routes/apis/userApis/apps/apps')
//Importing other apis
const notificationRoutes = require('./backend/routes/apis/userApis/notificationsRoutes');
const shareBot = require('./backend/routes/apis/userApis/shareBot');
const buyHeroku = require('./backend/routes/apis/userApis/buyHeroku');
const myHeroku = require('./backend/routes/apis/userApis/myHeroku');
const botRequests = require('./backend/routes/apis/userApis/botRequests');
const configVars = require('./backend/routes/apis/userApis/apps/configVars');
const favoriteBot = require('./backend/routes/apis/userApis/favoriteBot');
const updateUser = require('./backend/routes/apis/userApis/updateUser');
const userBannedAppeal = require('./backend/routes/apis/userApis/userBannedAppeal');
const supportSystem = require('./backend/routes/apis/userApis/supportSystem');
const user = require('./backend/routes/apis/userApis/user');
//Importing admin apis
const allbots = require('./backend/routes/apis/admin/allBots');
const manageBots = require('./backend/routes/apis/admin/manageBots');
const botReports = require('./backend/routes/apis/admin/botReports');
const users = require('./backend/routes/apis/admin/users');
const apiKeysRoutes = require('./backend/routes/apis/admin/apiKeysRoutes');
const notifications = require('./backend/routes/apis/admin/notifications');
const suspendBots = require('./backend/routes/apis/admin/suspendBots');
const bannedAppeal = require('./backend/routes/apis/admin/bannedAppeal');
const supportSystemManage = require('./backend/routes/apis/admin/supportSystemManage');

// Importing moderator apis
const botModerator = require('./backend/routes/apis/moderator/botModerator');
const manageModerator = require('./backend/routes/apis/admin/manageModerator');

// All routes:
app.use('/', lander);
app.use('/auth', authRoutes);
app.use('/dashboard', dashboard);
app.use('/moderator', moderator);
app.use('/hamza', admin);
app.use('/', selectBot);
app.use('/', prepareDeployment);

//// Apiiiiiiiiiiiiiiis
// Auth routes
app.use('/', login);
app.use('/', signup);
// app.use('/', testMail);
app.use('/', router);
app.use('/', checkBan);
app.use('/', checkUsername);
app.use('/', resetPassword);
app.use('/', checkLogin);



// // Imp apis
app.use('/', userApps);
app.use('/', totalUsers);
app.use('/', userCoins);
app.use('/', claimCoins);
app.use('/', logout);
app.use('/', countries);
app.use('/', invite);
app.use('/', depositRequest);
app.use('/', reportBots);
app.use('/', transferFromTalkDrove);
app.use('/', contactUs);
app.use('/', walletRoutes);
app.use('/', devices);
app.use('/', serverStats);
//DEPLOY APIS routes

app.use('/', deploy);

//Bot apis
app.use('/', botDetails);
app.use('/', subscribe);
app.use('/', apps);
app.use('/', appLogs);
app.use('/', appTerminal);
app.use('/', deleteAppRoute);


// Other route apis
app.use('/', notificationRoutes);
app.use('/', shareBot);
app.use('/', myHeroku);
app.use('/', botRequests);
app.use('/', configVars);
app.use('/', favoriteBot);
app.use('/', buyHeroku);
app.use('/', user);
app.use('/', updateUser);
app.use('/', userBannedAppeal);
app.use('/', supportSystem);
app.use('/', checkAppName);




// Admin apis
app.use('/', allbots);
app.use('/api', manageBots);
app.use('/', users);
app.use('/', botReports);
app.use('/', apiKeysRoutes);
app.use('/', notifications);
app.use('/', suspendBots);
app.use('/', bannedAppeal);
app.use('/', supportSystemManage);





// Moderator apis
app.use('/', botModerator);
app.use('/', manageModerator);


/// Deploy route



// async function initDatabase() {
//     try {
//         const connection = await pool.getConnection();
//         // All quires
//         connection.release();

//         console.log('All database queries completed.');
//     } catch (error) {
//         console.error('Error initializing database:', error);
//     }
// }


// connectToWA(),
// Promise.all([initDatabase()])













// 404 Error Middleware
app.use((req, res, next) => {
    res.status(404).render('404', { url: req.originalUrl });
});

// setInterval(() => {
//   process.exit(0); // Forcefully exit the process
// }, 5 * 60 * 1000); // 5 minutes in milliseconds

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
