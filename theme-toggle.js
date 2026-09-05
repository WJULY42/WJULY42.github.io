// Theme Toggle Functionality
(function() {
    'use strict';

    // Theme storage key
    const THEME_KEY = 'lunarhope_theme';

    // Get theme from localStorage or system preference
    function getPreferredTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved) {
            return saved;
        }
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    // Update all toggle buttons to reflect the current theme
    function updateToggleButtons(theme) {
        const isLight = theme === 'light';
        const icon = isLight ? '🌙' : '☀️';
        const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';

        document.querySelectorAll('.theme-toggle').forEach(btn => {
            btn.textContent = icon;
            btn.setAttribute('aria-label', label);
            btn.title = label;
        });
    }

    // Apply theme to document
    function applyTheme(theme) {
        const html = document.documentElement;

        if (theme === 'light') {
            html.classList.remove('dark');
            html.classList.add('light');
        } else {
            html.classList.remove('light');
            html.classList.add('dark');
        }

        localStorage.setItem(THEME_KEY, theme);
        updateToggleButtons(theme);
    }

    // Create a floating toggle button if no .theme-toggle button exists in the page
    function ensureToggleButton() {
        if (document.querySelector('.theme-toggle')) {
            // Header buttons are present; make sure their icons reflect the current theme.
            updateToggleButtons(getPreferredTheme());
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'theme-toggle-btn';
        btn.className = 'theme-toggle';
        btn.setAttribute('aria-label', 'Toggle theme');
        btn.type = 'button';
        btn.addEventListener('click', toggleTheme);
        document.body.appendChild(btn);
        updateToggleButtons(getPreferredTheme());
    }

    // Toggle theme function
    function toggleTheme() {
        const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    }

    // Expose for inline onclick usage
    window.toggleTheme = toggleTheme;

    // Initialize
    applyTheme(getPreferredTheme());

    // Wait for DOM ready so the button can be created safely
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureToggleButton);
    } else {
        ensureToggleButton();
    }

    // Attach to existing buttons (including dynamically added ones)
    document.addEventListener('click', (e) => {
        if (e.target.closest('.theme-toggle')) {
            toggleTheme();
        }
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
        if (!localStorage.getItem(THEME_KEY)) {
            applyTheme(e.matches ? 'light' : 'dark');
        }
    });
})();
