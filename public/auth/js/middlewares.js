
// Theme handling
const themeToggle = document.getElementById('themeToggle');
const themeToggleMobile = document.getElementById('themeToggle-mobile');

const root = document.documentElement;

function setTheme(theme) {
root.setAttribute('data-theme', theme);
localStorage.setItem('theme', theme);
themeToggle.innerHTML = theme === 'dark'
? '<i class="fas fa-sun"></i>'
: '<i class="fas fa-moon"></i>';
}

// Initialize theme
document.addEventListener('DOMContentLoaded', () => {
const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);
});

themeToggle.addEventListener('click', () => {
const currentTheme = root.getAttribute('data-theme');
setTheme(currentTheme === 'dark' ? 'light' : 'dark');
});
themeToggleMobile.addEventListener('click', () => {
const currentTheme = root.getAttribute('data-theme');
setTheme(currentTheme === 'dark' ? 'light' : 'dark');
});
// Mobile menu handling
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenuClose = document.getElementById('mobile-menu-close');
const mobileMenu = document.getElementById('mobile-menu');
const menuContent = document.querySelector('.menu-content');

// Handle mobile menu
function toggleMobileMenu(show) {
if (show) {
mobileMenu.classList.remove('hidden');
setTimeout(() => {
    mobileMenu.classList.add('menu-overlay', 'active');

}, 10);
// document.body.style.overflow = 'hidden'; // Prevent background scrolling
} else {
mobileMenu.classList.remove('active');
setTimeout(() => {
    mobileMenu.classList.add('hidden');
    document.body.style.overflow = '';
}, 300);
}
}

if (mobileMenuButton) {
mobileMenuButton.addEventListener('click', () => toggleMobileMenu(true));
}

if (mobileMenuClose) {
mobileMenuClose.addEventListener('click', () => toggleMobileMenu(false));
}

// Close menu on outside click
if (mobileMenu) {
mobileMenu.addEventListener('click', (e) => {
if (e.target === mobileMenu) {
    toggleMobileMenu(false);
}
});
}

// Handle smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
anchor.addEventListener('click', function (e) {
e.preventDefault();
const target = document.querySelector(this.getAttribute('href'));
if (target) {
    // Close mobile menu if open
    toggleMobileMenu(false);

    // Smooth scroll to target
    target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}
});
});

// Create toast container
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

// Updated Toast Functionality
function showToast(message, type = 'success') {
// Create toast container if it doesn't exist
let toastContainer = document.querySelector('.toast-container');
if (!toastContainer) {
toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);
}

// Create toast element
const toast = document.createElement('div');
toast.className = `toast ${type}`;


// Add message
const messageSpan = document.createElement('span');
messageSpan.textContent = message;

// Assemble toast

toast.appendChild(messageSpan);

// Add to container
toastContainer.appendChild(toast);

// Show toast with animation
requestAnimationFrame(() => {
toast.classList.add('show');
});

// Auto dismiss after 5 seconds
const dismissTimeout = setTimeout(() => {
dismissToast(toast);
}, 5000);

// Click to dismiss
toast.addEventListener('click', () => {
clearTimeout(dismissTimeout);
dismissToast(toast);
});
}

function dismissToast(toast) {
toast.classList.add('hide');
setTimeout(() => {
toast.remove();
const container = document.querySelector('.toast-container');
if (container && container.children.length === 0) {
    container.remove();
}
}, 300);
}




// Password Toggle
const togglePassword = () => {
const passwordInput = document.getElementById('password');
const toggleIcon = document.querySelector('.password-toggle');
if (passwordInput.type === 'password') {
passwordInput.type = 'text';
toggleIcon.textContent = '🔒';
} else {
passwordInput.type = 'password';
toggleIcon.textContent = '👀';
}
};


// Password toggle functions
function toggleNewPassword() {
    const input = document.getElementById('newPassword');
    const toggle = input.nextElementSibling;
    if (input.type === 'password') {
    input.type = 'text';
    toggle.textContent = '🔒';
    } else {
    input.type = 'password';
    toggle.textContent = '👀';
    }
    }
    
    function toggleConfirmPassword() {
    const input = document.getElementById('confirmPassword');
    const toggle = input.nextElementSibling;
    if (input.type === 'password') {
    input.type = 'text';
    toggle.textContent = '🔒';
    } else {
    input.type = 'password';
    toggle.textContent = '👀';
    }
    }