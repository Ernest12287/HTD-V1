const express = require('express');
const router = express.Router();
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const requestIp = require('request-ip');
const pool = require('../../../database/sqlConnection');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const validator = require('validator');
const nodemailer = require('nodemailer');
const { EmailSenderManager } = require('./emailRoute');


router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));


const normalizeIp = (ip) => {
    if (!ip) return null;
    if (ip === '::1' || ip === '::ffff:127.0.0.1') return '127.0.0.1';
    return ip.replace(/^::ffff:/, '');
};

// Helper function to get device info
function getDeviceInfo(req) {
    const ua = new UAParser(req.headers['user-agent']);
    return {
        browser: ua.getBrowser().name,
        os: ua.getOS().name,
        device: ua.getDevice().type || 'desktop'
    };
}


function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];

    if (forwarded) {
        const ips = forwarded.split(',').map(ip => ip.trim());
        return ips[0];
    }

    return requestIp.getClientIp(req) ||
        req.headers['x-real-ip'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress;
}


const verificationCodes = new Map();

router.post('/login', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required' 
            });
        }

        
        if (!validator.isEmail(identifier)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid email format' 
            });
        }

        console.log('Incoming Login Request:', { identifier });

        
        const [users] = await connection.query('SELECT * FROM users WHERE email = ?', [identifier]);

        if (users.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        const user = users[0];

        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid credentials' 
            });
        }

        
        const clientIp = getClientIp(req);
        const deviceInfo = getDeviceInfo(req);
        const geo = geoip.lookup(clientIp);
        const normalizedClientIp = normalizeIp(clientIp);

        
        const emailSenderManager = new EmailSenderManager(pool);

        
        const [knownDevices] = await connection.query(
            'SELECT * FROM user_devices WHERE user_id = ? AND device_info = ? AND is_verified = 1',
            [user.id, JSON.stringify(deviceInfo)]
        );

        if (knownDevices.length > 0) {
            
            await connection.query(
                'UPDATE user_devices SET last_used = NOW(), ip_address = ? WHERE id = ?',
                [normalizedClientIp, knownDevices[0].id]
            );

            await connection.commit();
            req.session.user = {
                id: user.id,
                email: user.email,
                isVerified: true,
                is_admin: user.is_admin === 1,
                deviceId: knownDevices[0].id
            };
            
            return res.json({
                success: true,
                message: 'Login successful',
                requireVerification: false
            });
        }


const [availableSenders] = await connection.query(`
    SELECT * FROM email_senders 
    WHERE is_active = 0 
    AND current_daily_count < daily_limit 
    AND (last_reset_date IS NULL OR last_reset_date != CURRENT_DATE)
    ORDER BY current_daily_count ASC
`);

        
        const verificationCode = crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 6);
        const deviceId = crypto.randomUUID();
        const location = geo ? `${geo.city}, ${geo.country}` : 'Unknown';

        
        async function sendVerificationEmail(sender) {
            const senderTransporter = nodemailer.createTransport({
                host: sender.host,
                port: sender.port,
                auth: {
                    user: sender.email,
                    pass: sender.password
                },
                secure: sender.port === 465,
                tls: {
                    rejectUnauthorized: false
                }
            });

            await senderTransporter.sendMail({
                from: sender.email,
                to: user.email,
                subject: '🔐 Verify New Device Login - TalkDrove',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    </head>
                    <body style="margin: 0; padding: 0; background-color: #f4f4f4;">
                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td align="center" style="padding: 40px 0;">
                                    <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                                        <tr>
                                            <td style="padding: 30px 40px 20px; text-align: left; background-color: #ff9800; border-radius: 8px 8px 0 0;">
                                                <h1 style="margin: 0; font-family: Arial, sans-serif; font-size: 24px; color: white;">
                                                    🔐 New Device Login Detected
                                                </h1>
                                            </td>
                                        </tr>
                                        
                                        <tr>
                                            <td style="padding: 30px 40px;">
                                                <p style="margin: 0 0 20px; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #333333;">
                                                    We detected a login attempt from a new device. For your security, please verify this login using the code below:
                                                </p>
                                                
                                                <div style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; text-align: center; margin: 30px 0;">
                                                    <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; color: #ff9800; letter-spacing: 5px;">
                                                        ${verificationCode}
                                                    </span>
                                                </div>

                                                <div style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; margin: 20px 0;">
                                                    <h2 style="margin: 0 0 15px; font-family: Arial, sans-serif; font-size: 18px; color: #333333;">
                                                        Login Details
                                                    </h2>
                                                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                                        <tr>
                                                            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #666666;">
                                                                📍 Location:
                                                            </td>
                                                            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #333333; font-weight: bold;">
                                                                ${location}
                                                            </td>
                                                        </tr>
                                                        <tr>
                                                            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #666666;">
                                                                🕒 Time:
                                                            </td>
                                                            <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #333333; font-weight: bold;">
                                                                ${new Date().toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </div>

                                                <div style="border-left: 4px solid #f44336; padding: 15px; margin: 20px 0; background-color: #ffebee;">
                                                    <p style="margin: 0; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #d32f2f;">
                                                        <strong>Wasn't you?</strong> If you didn't attempt this login, please:
                                                        <br>1. Change your password immediately
                                                        <br>2. Enable two-factor authentication
                                                        <br>3. Contact our support team
                                                    </p>
                                                </div>

                                                <p style="margin: 20px 0 0; font-family: Arial, sans-serif; font-size: 14px; color: #666666;">
                                                    This verification code will expire in 30 minutes for your security.
                                                </p>
                                            </td>
                                        </tr>
                                        
                                        <tr>
                                            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #eeeeee;">
                                                <p style="margin: 0; font-family: Arial, sans-serif; font-size: 12px; color: #999999;">
                                                    This is an automated message from TalkDrove Security. Please do not reply to this email.
                                                    <br>© ${new Date().getFullYear()} TalkDrove. All rights reserved.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </body>
                    </html>
                `
            });

            
            await emailSenderManager.trackEmailSent(sender.id);
        }

        
        let emailSent = false;
        let chosenSender = null;

        for (const sender of availableSenders) {
            try {
                await sendVerificationEmail(sender);
                emailSent = true;
                chosenSender = sender;
                break;
            } catch (emailError) {
                console.error(`Failed to send email with sender ${sender.email}:`, emailError);
                
                await emailSenderManager.updateEmailSender(sender.id, { 
                    is_active: 0 
                });
                continue;
            }
        }

        
        if (!emailSent) {
            return res.status(500).json({
                success: false,
                message: 'Unable to send verification email. Please try again later.'
            });
        }

        
        await connection.query(
            'INSERT INTO user_devices (id, user_id, ip_address, device_info, location, last_used, is_verified) VALUES (?, ?, ?, ?, ?, NOW(), 0)',
            [deviceId, user.id, normalizedClientIp, JSON.stringify(deviceInfo), location]
        );

        
        verificationCodes.set(identifier, {
            code: verificationCode,
            timestamp: Date.now(),
            attempts: 0,
            deviceId,
            deviceInfo,
            pendingIp: normalizedClientIp,
            location,
            userId: user.id,
            senderId: chosenSender.id
        });

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'New device detected. Verification code sent.',
            requireVerification: true,
            pendingDeviceId: deviceId
        });

    } catch (error) {
        await connection.rollback();
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false,
            error: 'An unexpected error occurred during login' 
        });
    } finally {
        connection.release();
    }
});


router.post('/verify-device-login', async (req, res) => {
    const { email, code } = req.body;

    
    if (!email || !code) {
        return res.status(400).json({ 
            success: false,
            message: 'Email and verification code are required' 
        });
    }

    try {
        
        const verificationData = verificationCodes.get(email);

        if (!verificationData) {
            return res.status(400).json({ 
                success: false,
                message: 'No verification request found. Please request a new code.' 
            });
        }

        
        const isExpired = (Date.now() - verificationData.timestamp) > 30 * 60 * 1000;
        if (isExpired) {
            verificationCodes.delete(email);
            return res.status(400).json({ 
                success: false,
                message: 'Verification code has expired. Please request a new code.' 
            });
        }

        
        if (verificationData.code !== code) {
            verificationData.attempts++;

            
            if (verificationData.attempts >= 3) {
                verificationCodes.delete(email);
                return res.status(429).json({ 
                    success: false,
                    message: 'Too many incorrect attempts. Please request a new code.' 
                });
            }

            return res.status(400).json({ 
                success: false,
                message: 'Invalid verification code' 
            });
        }

        
        await pool.query(
            'UPDATE user_devices SET is_verified = 1, last_used = NOW() WHERE id = ?',
            [verificationData.deviceId]
        );

        
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        
        req.session.user = {
            id: user.id,
            email: user.email,
            isVerified: true,
            is_admin: user.is_admin === 1,
            deviceId: verificationData.deviceId
        };

        
        await pool.query('UPDATE users SET last_login = NOW() WHERE email = ?', [email]);

        
        verificationCodes.delete(email);

        return res.status(200).json({
            success: true,
            message: 'Device verified successfully',
            user: req.session.user
        });

    } catch (error) {
        console.error('Device verification error:', error);
        res.status(500).json({ 
            success: false,
            message: 'An unexpected error occurred during device verification' 
        });
    }
});



router.post('/verify-email-login', async (req, res) => {
    const { email, code } = req.body;

    
    if (!email || !code) {
        return res.status(400).json({ 
            success: false,
            message: 'Email and verification code are required' 
        });
    }

    try {
        
        const verificationData = verificationCodes.get(email);

        if (!verificationData) {
            return res.status(400).json({ 
                success: false,
                message: 'No verification request found. Please request a new code.' 
            });
        }

        
        const isExpired = (Date.now() - verificationData.timestamp) > 30 * 60 * 1000;
        if (isExpired) {
            verificationCodes.delete(email);
            return res.status(400).json({ 
                success: false,
                message: 'Verification code has expired. Please request a new code.' 
            });
        }

        
        if (verificationData.code !== code) {
            verificationData.attempts++;

            
            if (verificationData.attempts >= 3) {
                verificationCodes.delete(email);
                return res.status(429).json({ 
                    success: false,
                    message: 'Too many incorrect attempts. Please request a new code.' 
                });
            }

            return res.status(400).json({ 
                success: false,
                message: 'Invalid verification code' 
            });
        }

        
        verificationCodes.delete(email);

        
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];

        
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            is_admin: user.is_admin
        };

        
        await pool.query('UPDATE users SET last_login = NOW() WHERE email = ?', [email]);

        return res.status(200).json({
            success: true,
            message: 'Login verified successfully',
            user: req.session.user 
        });

    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ 
            success: false,
            message: 'An unexpected error occurred during verification' 
        });
    }
});



function cleanupVerificationCodes() {
    const now = Date.now();
    for (const [key, verification] of verificationCodes.entries()) {
        if (now - verification.timestamp > 30 * 60 * 1000) {
            console.log(`Removing expired verification code for ${key}`);
            verificationCodes.delete(key);
        }
    }
}


setInterval(cleanupVerificationCodes, 10 * 60 * 1000);

module.exports = router;