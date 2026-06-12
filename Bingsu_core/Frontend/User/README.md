# React App with Tailwind CSS

โปรเจ็กต์ React พื้นฐานที่ใช้ JavaScript และ Tailwind CSS (ไม่ใช่ Vite)

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
- **Tailwind CSS 3** - Utility-first CSS framework
- **Create React App** - Build tool และ development server
- **JavaScript** - Programming language

## โครงสร้างโปรเจ็กต์

```
react-app/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── App.js              # Main App component
│   ├── index.js            # Entry point
│   └── index.css           # Tailwind directives
├── package.json            # Dependencies
├── tailwind.config.js      # Tailwind configuration
└── postcss.config.js       # PostCSS configuration
```
