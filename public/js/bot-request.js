// Move existing content into container div when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const container = document.querySelector('body');
    const bodyChildren = Array.from(document.body.children);
    
    bodyChildren.forEach(child => {
        if (child.id !== 'instructionsModal' && child.id !== 'container') {
            container.appendChild(child);
        }
    });

    // Initialize default environment variables
    initializeEnvVars();
});

// Define default environment variables
const defaultEnvVars = [
    {
        name: 'SESSION_ID',
        description: 'Your WhatsApp session ID for bot authentication'
    },
    {
        name: 'PREFIX',
        description: 'Command prefix for the bot (e.g., !, /, #)'
    },
    {
        name: 'OWNER_NUMBER',
        description: 'WhatsApp number of the bot owner (with country code)'
    }
];

// Function to initialize environment variables
function initializeEnvVars() {
    const envVarsContainer = document.getElementById('envVarsContainer');
    
    // Clear any existing content
    envVarsContainer.innerHTML = '';
    
    // Add default environment variables
    defaultEnvVars.forEach(envVar => {
        const container = document.createElement('div');
        container.className = 'env-var-group default-env';
        container.innerHTML = `
            <div class="inputs">
                <input type="text" value="${envVar.name}" readonly class="default-env-input">
                <input type="text" value="${envVar.description}" readonly class="default-env-input">
            </div>
            <small class="default-env-label">Required</small>
        `;
        envVarsContainer.appendChild(container);
    });

    // Add initial empty variable group for custom entries
    addEmptyEnvVar();
}

// Hide loading screen
const loadingScreen = document.getElementById('loading-screen');
loadingScreen.style.display = 'none';

// Restore form data
const savedFormData = localStorage.getItem('botRequestFormData');
if (savedFormData) {
    const formData = JSON.parse(savedFormData);
    Object.keys(formData).forEach(key => {
        const input = document.getElementById(key);
        if (input) {
            input.value = formData[key];
        }
    });
}

// Function to handle modal response
function handleModalResponse(accepted) {
    const modal = document.getElementById('instructionsModal');
    const content = document.querySelector('.container');
    
    if (accepted) {
        modal.style.display = 'none';
        content.style.display = 'block';
    } else {
        window.location.href = '/dashboard';
    }
}

// Notification handling
function showNotification(message, type = 'success') {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.success-message, .error-message');
    existingNotifications.forEach(notification => notification.remove());

    // Create new notification
    const notification = document.createElement('div');
    notification.className = type === 'success' ? 'success-message' : 'error-message';
    
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <div class="message-content">${message}</div>
        <button class="close-notification" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(notification);

    // Trigger animation to show the notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}

// Function to add empty environment variable
function addEmptyEnvVar() {
    const container = document.createElement('div');
    container.className = 'env-var-group custom-env';
    container.innerHTML = `
        <button type="button" class="remove-env" onclick="this.parentElement.remove()">×</button>
        <div class="inputs">
            <input type="text" placeholder="Variable Name (e.g., API_KEY)" required>
            <input type="text" placeholder="Description of this variable" required>
        </div>
    `;
    document.getElementById('envVarsContainer').appendChild(container);
}

// Environment variables handling
document.getElementById('addEnvVar').addEventListener('click', addEmptyEnvVar);

// Form validation
function validateRepoUrl(url) {
    const urlRegex = /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-_.]+$/;
    return urlRegex.test(url);
}

// Form submission handling
document.getElementById('botRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const botName = document.getElementById('botName').value;
    const repoUrl = document.getElementById('repoUrl').value;
    const deploymentCost = document.getElementById('deploymentCost').value;
    const websiteUrl = document.getElementById('websiteUrl').value;

    // Validate repository URL
    if (!validateRepoUrl(repoUrl)) {
        showNotification('Please enter a valid repository URL format (username/repository)', 'error');
        return;
    }

    // Collect all environment variables (default + custom)
    const envVars = [];
    
    // Add default variables
    document.querySelectorAll('.env-var-group.default-env').forEach(group => {
        const inputs = group.getElementsByTagName('input');
        envVars.push({
            name: inputs[0].value,
            description: inputs[1].value,
            required: true
        });
    });

    // Add custom variables
    document.querySelectorAll('.env-var-group.custom-env').forEach(group => {
        const inputs = group.getElementsByTagName('input');
        const name = inputs[0].value.trim();
        const description = inputs[1].value.trim();
        if (name && description) {
            envVars.push({
                name,
                description,
                required: false
            });
        }
    });

    // Validate that we have at least one custom env var
    if (envVars.length === defaultEnvVars.length) {
        showNotification('Please add at least one custom environment variable', 'error');
        return;
    }

    const data = {
        name: botName.trim(),
        repoUrl: repoUrl.trim(),
        deploymentCost: parseInt(deploymentCost),
        websiteUrl: websiteUrl.trim(),
        envVars
    };

    // Show loading screen
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.style.display = 'flex';

    try {
        const response = await fetch('/bot-request', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const result = await response.json();
        showNotification('Bot request submitted successfully!', 'success');

        // Reset form after successful submission
        setTimeout(() => {
            resetForm();
        }, 3000);
    } catch (error) {
        showNotification(`Error submitting request: ${error.message}`, 'error');
    } finally {
        loadingScreen.style.display = 'none';
    }
});

// Form reset utility function
function resetForm() {
    const form = document.getElementById('botRequestForm');
    form.reset();

    // Reset environment variables to initial state
    const envVarsContainer = document.getElementById('envVarsContainer');
    
    // Clear all existing env vars
    envVarsContainer.innerHTML = '';
    
    // Reinitialize with defaults and one empty custom var
    initializeEnvVars();

    // Clear local storage
    localStorage.removeItem('botRequestFormData');
}

// Add input validation for deployment cost
document.getElementById('deploymentCost').addEventListener('input', function() {
    this.value = Math.max(0, Math.floor(this.value));
});

// Add input validation for website URL
document.getElementById('websiteUrl').addEventListener('input', function() {
    if (this.value && !this.value.startsWith('http')) {
        this.value = 'https://' + this.value;
    }
});

// Add form autosave functionality
const formInputs = document.querySelectorAll('input');
formInputs.forEach(input => {
    input.addEventListener('change', () => {
        const formData = {};
        formInputs.forEach(inp => {
            if (inp.id) {
                formData[inp.id] = inp.value;
            }
        });
        localStorage.setItem('botRequestFormData', JSON.stringify(formData));
    });
});


