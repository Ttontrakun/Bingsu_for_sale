# Support Admin Dashboard

React application with routing and Tailwind CSS for the Support Admin dashboard.

## การติดตั้ง

ติดตั้ง dependencies:

```bash
npm install
```

## การใช้งาน

### รัน Development Server

```bash
npm start
```

แอปจะเปิดที่ `http://localhost:3000`

### Build สำหรับ Production

```bash
npm run build
```

### รัน Tests

```bash
npm test
```

## เทคโนโลยีที่ใช้

- **React 18** - UI library
- **React Router DOM** - Routing
- **Tailwind CSS 3** - Utility-first CSS framework
- **Create React App** - Build tool และ development server

## โครงสร้างโปรเจ็กต์

```
Supportadmin/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── pages/              # หน้าแต่ละหน้า
│   │   ├── Home.js
│   │   ├── Dashboard.js
│   │   └── About.js
│   ├── App.js              # Main App component with routing
│   ├── index.js            # Entry point
│   └── index.css           # Tailwind directives
├── package.json            # Dependencies
├── tailwind.config.js      # Tailwind configuration
└── postcss.config.js       # PostCSS configuration
```

## Routes

- `/` - Redirects to `/home`
- `/home` - Home page
- `/dashboard` - Dashboard page
- `/about` - About page
