const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const validator = require('email-validator');
const isDisposable = require('is-disposable-email');

const transporter = require('../../../database/emailConnection');
const pool = require('../../../database/sqlConnection');


router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));


const verificationCodes = new Map();


function getClientIp(req) {
    
    const ipHeaders = [
        'x-forwarded-for',
        'x-real-ip',
        'cf-connecting-ip',
        'x-client-ip'
    ];

    
    for (const header of ipHeaders) {
        const ip = req.headers[header];
        if (ip) {
            
            const possibleIp = ip.toString().split(',')[0].trim();
            
            
            const ipv4Regex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
            const privateIpRegex = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;
            
            
            if (ipv4Regex.test(possibleIp) && !privateIpRegex.test(possibleIp)) {
                return possibleIp;
            }
        }
    }

    
    let fallbackIp = req.ip || 
                    req.connection.remoteAddress || 
                    req.socket.remoteAddress;

    
    fallbackIp = fallbackIp.replace(/^::ffff:/, '');

    // Validate fallback IP
    const ipv4Regex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
    const privateIpRegex = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;

    // Return validated IP or default to '0.0.0.0' if invalid
    return (ipv4Regex.test(fallbackIp) && !privateIpRegex.test(fallbackIp)) 
        ? fallbackIp 
        : '0.0.0.0';
}


async function checkAndTrackIpSignup(ip, connection) {
    const MAX_ACCOUNTS_PER_IP = 2;
    const TRACKING_WINDOW_DAYS = 30;

    try {
        const ipv4Regex = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;
        const privateIpRegex = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;

        if (!ipv4Regex.test(ip) || privateIpRegex.test(ip)) {
            console.warn('Invalid or private IP detected:', ip);
            return false; 
        }

        
        const [existingRecords] = await connection.query(
            `SELECT id, account_count, last_signup, 
                    (DATEDIFF(NOW(), last_signup) <= ?) as is_recent
             FROM ip_account_tracking 
             WHERE ip_address = ?`,
            [TRACKING_WINDOW_DAYS, ip]
        );

        
        if (existingRecords.length === 0) {
            await connection.query(
                'INSERT INTO ip_account_tracking (ip_address, account_count, last_signup) VALUES (?, 1, NOW())',
                [ip]
            );
            return true;
        }

        const record = existingRecords[0];

        
        if (record.is_recent && record.account_count >= MAX_ACCOUNTS_PER_IP) {
            return false; 
        }

        
        await connection.query(
            'UPDATE ip_account_tracking SET account_count = account_count + 1, last_signup = NOW() WHERE ip_address = ?',
            [ip]
        );

        return true;
    } catch (error) {
        console.error('Error checking IP signup:', error);
        return false;
    }
}


function generateReferralCode(length = 8) {
    return crypto.randomBytes(length).toString('hex').toUpperCase().slice(0, length);
}


function generateVerificationCode(length = 6) {
    return crypto.randomBytes(length).toString('hex').toUpperCase().slice(0, length);
}


function validateUsername(username) {
    
    if (!username || username.trim().length < 3 || username.trim().length > 15) {
        return {
            valid: false,
            message: 'Username must be between 3 and 15 characters'
        };
    }

    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return {
            valid: false,
            message: 'Username can only contain letters, numbers, and underscores'
        };
    }

    return { valid: true };
}


router.post('/signup', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { email, password, country, referralCode, username } = req.body;
        
        
        const clientIp = getClientIp(req);
        
        
        console.log('Signup attempt:', {
            ip: clientIp,
            fullHeaders: JSON.stringify(req.headers)
        });

        
        const usernameValidation = validateUsername(username);
        if (!usernameValidation.valid) {
            return res.status(400).json({
                success: false,
                message: usernameValidation.message
            });
        }

        
        const [existingUsernames] = await connection.query(
            'SELECT * FROM users WHERE LOWER(username) = LOWER(?)', 
            [username]
        );
        if (existingUsernames.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Username is already taken'
            });
        }

        
        if (!password || password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long'
            });
        }

        
        if (!validator.validate(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        
        const allowedDomains = ['gmail.com', 'talkdrove.com'];
        const domain = email.split('@')[1].toLowerCase();
        if (!allowedDomains.includes(domain)) {
            return res.status(400).json({
                success: false,
                message: 'Only Gmail and TalkDrove emails are allowed'
            });
        }

        
        if (isDisposable(email)) {
            return res.status(400).json({
                success: false,
                message: 'Temporary/disposable emails are not allowed'
            });
        }

        
        const [existingUsers] = await connection.query(
            'SELECT * FROM users WHERE email = ?', 
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        
        let referredById = null;
        if (referralCode) {
            const [referrer] = await connection.query(
                'SELECT id FROM users WHERE referral_code = ?',
                [referralCode]
            );
            if (referrer.length > 0) {
                referredById = referrer[0].id;
            }
        }

        
        const hashedPassword = await bcrypt.hash(password, 10);

        
        const verificationCode = generateVerificationCode();

        
        verificationCodes.set(email, {
            code: verificationCode,
            password: hashedPassword,
            username,
            country,
            timestamp: Date.now(),
            attempts: 0,
            referredBy: referredById,
            clientIp 
        });

        
        await transporter.sendMail({
            from: '"TalkDrove" <msg@talkdrove.com>',
            to: email,
            subject: 'Verify Your TalkDrove Account',
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
                            <!-- Alert Header -->
                            <tr>
                                <td style="padding: 30px 40px 20px; text-align: left; background-color: #ff9800; border-radius: 8px 8px 0 0;">
                                    <h1 style="margin: 0; font-family: Arial, sans-serif; font-size: 24px; color: white;">
                                        Verify your device!
                                    </h1>
                                </td>
                            </tr>
                                    
                                    <!-- Main Content -->
                                    <tr>
                                        <td style="padding: 20px 40px;">
                                            <p style="margin: 0 0 20px; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #555555;">
                                                Thanks for signing up for TalkDrove! Please use the verification code below to complete your registration:
                                            </p>
                                            
                                            <!-- Verification Code Box -->
                                            <div style="background-color: #f8f9fa; border-radius: 6px; padding: 20px; text-align: center; margin: 30px 0;">
                                                <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; color: #2196F3; letter-spacing: 5px;">
                                                    ${verificationCode}
                                                </span>
                                            </div>
                                            
                                            <p style="margin: 0 0 10px; font-family: Arial, sans-serif; font-size: 14px; color: #666666;">
                                                This code will expire in 30 minutes for security purposes.
                                            </p>
                                            
                                            <p style="margin: 0; font-family: Arial, sans-serif; font-size: 14px; color: #666666;">
                                                If you didn't request this code, you can safely ignore this email.
                                            </p>
                                        </td>
                                    </tr>
                                    
                                   <!-- Footer -->
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

        await connection.commit();

        return res.json({
            success: true,
            message: 'Verification code sent. Please check your email.'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during signup'
        });
    } finally {
        connection.release();
    }
});



router.post('/verify-signup', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { email, code } = req.body;

        const verification = verificationCodes.get(email);
        
        if (!verification) {
            return res.status(400).json({
                success: false,
                message: 'No verification pending or code expired'
            });
        }

        
        if (verification.code !== code) {
            verification.attempts++;
            if (verification.attempts >= 5) {
                verificationCodes.delete(email);
                return res.status(400).json({
                    success: false,
                    message: 'Too many failed attempts. Please try again.'
                });
            }

            return res.status(400).json({
                success: false,
                message: 'Invalid verification code',
                attemptsLeft: 5 - verification.attempts
            });
        }

        
        if (Date.now() - verification.timestamp > 30 * 60 * 1000) {
            verificationCodes.delete(email);
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired. Please try again.'
            });
        }

        
        const MAX_ACCOUNTS_PER_IP = 1;
        const TRACKING_WINDOW_DAYS = 30;

        try {
            await connection.beginTransaction();

            
            const [existingRecords] = await connection.query(
                `SELECT id, account_count, last_signup, 
                        (DATEDIFF(NOW(), last_signup) <= ?) as is_recent
                 FROM ip_account_tracking 
                 WHERE ip_address = ?`,
                [TRACKING_WINDOW_DAYS, verification.clientIp]
            );

            let shouldBanAccount = false;

            if (existingRecords.length > 0) {
                const record = existingRecords[0];
                
                
                if (record.is_recent && record.account_count >= MAX_ACCOUNTS_PER_IP) {
                    shouldBanAccount = true;
                }
            }

            const newReferralCode = generateReferralCode();

            
            const [result] = await connection.query(
                `INSERT INTO users (
                    email, 
                    password, 
                    is_verified, 
                    referral_code,
                    coins,
                    created_at,
                    last_login,
                    status,
                    is_banned,
                    username,
                    referred_by
                ) VALUES (?, ?, true, ?, 0, NOW(), NOW(), ?, ?, ?, ?)`,

                [
                    email, 
                    verification.password, 
                    newReferralCode,
                    shouldBanAccount ? 'banned' : 'active',
                    shouldBanAccount,
                    verification.username,
                    verification.referredBy
                ]
            );

            
            if (existingRecords.length === 0) {
                
                await connection.query(
                    'INSERT INTO ip_account_tracking (ip_address, account_count, last_signup) VALUES (?, 1, NOW())',
                    [verification.clientIp]
                );
            } else {
                
                await connection.query(
                    'UPDATE ip_account_tracking SET account_count = account_count + 1, last_signup = NOW() WHERE ip_address = ?',
                    [verification.clientIp]
                );
            }

            
            if (verification.referredBy) {
                await connection.query(
                    'UPDATE users SET coins = coins + 10 WHERE id = ?',
                    [verification.referredBy]
                );
            }

            
            await connection.query(
                `INSERT INTO user_country (user_id, country) VALUES (?, ?)`,

                [result.insertId, verification.country]
            );

            
            await connection.query(
                'INSERT INTO wallets (user_id, balance) VALUES (?, 0)',
                [result.insertId]
            );

            await connection.commit();

            
            verificationCodes.delete(email);

            
            if (shouldBanAccount) {
                
                req.session.user = {
                    is_banned: shouldBanAccount ? 1 : 0, 
                    id: result.insertId,
                    email: email,
                    isVerified: true,
                };
                

                return res.json({
                    success: true,
                    banned: true,
                    message: 'We are having problem with your account, please contact support!'
                });
            }

            
            req.session.user = {
                id: result.insertId,
                email: email,
                isVerified: true,
                is_banned: false, 
                is_admin: 0 
            };

            return res.json({
                success: true,
                message: 'Registration successful!',
                user: {
                    id: result.insertId,
                    email: email,
                    username: verification.username,
                    referralCode: newReferralCode,
                    country: verification.country
                }
            });

        } catch (dbError) {
            await connection.rollback();
            console.error('Database error during registration:', dbError);
            return res.status(500).json({
                success: false,
                message: 'Error creating user account'
            });
        }
    } catch (error) {
        console.error('Signup verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred during signup verification'
        });
    } finally {
        connection.release();
    }
});


    
    setInterval(() => {
        const now = Date.now();
        for (const [email, verification] of verificationCodes.entries()) {
            
            if (now - verification.timestamp > 30 * 60 * 1000) {
                verificationCodes.delete(email);
            }
        }
        console.log(`Cleaned up verification codes. Remaining: ${verificationCodes.size}`);
    }, 10 * 60 * 1000);

    module.exports = router;