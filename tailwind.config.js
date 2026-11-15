/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Compatibility aliases (match docs/frontend_ui_page_code.md naming)
        'neu-bg': '#EFEEEE',
        'neu-text-main': '#323842',
        'neu-text-sub': '#8A94A6',
        'neu-accent': '#4F46E5',
        'accent-yellow': '#FACC15',
        neu: {
          bg: '#EFEEEE', // Standard Grey-White
          text: {
            DEFAULT: '#1F2937', // Gray 900
            secondary: '#6B7280', // Gray 500
            placeholder: '#9CA3AF', // Gray 400
          },
        },
        primary: {
          DEFAULT: '#3B82F6', // Blue 500
          hover: '#2563EB',   // Blue 600
          active: '#1D4ED8',  // Blue 700
        },
        accent: {
          DEFAULT: '#FCD34D', // Amber 300
          hover: '#FBBF24',   // Amber 400
        },
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
        'neu-popup': '#EFEEEE',
      },
      fontFamily: {
        sans: ['Lexend', 'Noto Sans SC', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'neu-flat': '5px 5px 10px #d1d1d1, -5px -5px 10px #ffffff',
        'neu-flat-sm': '3px 3px 6px #d1d1d1, -3px -3px 6px #ffffff',
        'neu-flat-lg': '12px 12px 24px #d1d1d1, -12px -12px 24px #ffffff',
        'neu-pressed': 'inset 5px 5px 10px #d1d1d1, inset -5px -5px 10px #ffffff',
        'neu-pressed-sm': 'inset 3px 3px 6px #d1d1d1, inset -3px -3px 6px #ffffff',
        'neu-icon': '3px 3px 6px #d1d1d1, -3px -3px 6px #ffffff',
        'neu-icon-pressed': 'inset 2px 2px 4px #d1d1d1, inset -2px -2px 4px #ffffff',
        'neu-icon-btn': '5px 5px 10px #d1d0d0, -5px -5px 10px #ffffff',
        // Specialized shadows
        'neu-btn': '4px 4px 8px #d1d1d1, -4px -4px 8px #ffffff',
        'neu-input': 'inset 4px 4px 8px #d1d1d1, inset -4px -4px 8px #ffffff',
        // High-fidelity Design Shadows
        'neu-base': '12px 12px 24px #cccccc, -12px -12px 24px #ffffff',
        'neu-inset': 'inset 6px 6px 12px #cccccc, inset -6px -6px 12px #ffffff',
        'neu-inset-sm': 'inset 3px 3px 6px #cccccc, inset -3px -3px 6px #ffffff',
        'neu-plate': '20px 20px 60px #cccccc, -20px -20px 60px #ffffff',
        'neu-circle': '8px 8px 16px #cccccc, -8px -8px 16px #ffffff',
        'neu-circle-pressed': 'inset 4px 4px 8px #cccccc, inset -4px -4px 8px #ffffff',
        'flow-ring': '10px 10px 20px #cccccc, -10px -10px 20px #ffffff, inset 10px 10px 20px rgba(204, 204, 204, 0.2), inset -10px -10px 20px rgba(255, 255, 255, 0.8)',
        // Uploading / scanning states (match docs/frontend_ui_page_code.md)
        'neu-convex': '8px 8px 16px #C9C9C9, -8px -8px 16px #FFFFFF',
        'neu-concave': 'inset 6px 6px 12px #C9C9C9, inset -6px -6px 12px #FFFFFF',
        'neu-deep': '12px 12px 28px #BFBFBF, -12px -12px 28px #FFFFFF',
        'neu-button': '6px 6px 12px #C9C9C9, -6px -6px 12px #FFFFFF',
        'neu-button-pressed': 'inset 4px 4px 8px #C9C9C9, inset -4px -4px 8px #FFFFFF',

        // Popup / modal shadows (match docs HTML references)
        'popup-base': '20px 20px 40px #cbd0d6, -20px -20px 40px #ffffff',
        'popup-flat': '5px 5px 10px #cbd0d6, -5px -5px 10px #ffffff',
        'popup-flat-sm': '3px 3px 6px #cbd0d6, -3px -3px 6px #ffffff',
        'popup-pressed': 'inset 4px 4px 8px #cbd0d6, inset -4px -4px 8px #ffffff',
        'popup-pressed-deep': 'inset 5px 5px 10px #bdc2c9, inset -5px -5px 10px #ffffff',
        'glow-blue': '0 0 15px rgba(59, 130, 246, 0.3)',

      },
      borderRadius: {
        '4xl': '2rem',    // 32px
        '5xl': '2.5rem',  // 40px
      },
      backgroundImage: {
        'scanner-gradient': 'linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(255,255,255,0) 50%, rgba(59,130,246,0.1) 100%)',
      },
      animation: {
        'scan': 'scan 2.5s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'scan-loop': 'scanLoop 2.5s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        scan: {
          '0%, 100%': { backgroundPosition: 'center top' },
          '50%': { backgroundPosition: 'center bottom' },
        },
        scanLoop: {
          '0%': { top: '0%', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { top: '100%', opacity: '0' },
        },
      }
    },
  },
  plugins: [],
}
