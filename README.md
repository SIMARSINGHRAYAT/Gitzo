# GITHUB_BULK_MANAGER

# GITHUB BULK MANAGER

**GitHub Bulk Manager** is a premium, high-performance automation suite designed to streamline repository management and secure profile achievements with a state-of-the-art glassmorphism interface. 

Built with **React**, **Vite**, and **TypeScript**, it provides a secure and efficient way to automate complex GitHub workflows, from bulk Pull Request creation to sophisticated "Badge" achievement triggers.

---

## ✨ Features

- 💎 **Premium Glassmorphism UI**: A stunning, modern interface with interactive hover effects, smooth transitions, and a curated dark-mode palette.
- 🛡️ **Secure Authentication**: Connect using GitHub Personal Access Tokens (PAT) with automated scope validation and permission checks.
- 📂 **Bulk Repository Management**: Search and select any repository (public or private) to perform orchestrated actions.
- ⚡ **Automated Achievement Workflows**: Specialized logic designed to trigger specific GitHub achievements deterministically.
- 📈 **Real-time Progress Tracking**: Monitor batch operations with a multi-step orchestration engine and live status updates.
- ⏸️ **Control Center**: Pause, resume, or cancel long-running operations with a single click.

---

## 🚀 Workflows

### 🏎️ Quickdraw Badge
Triggers the "Quickdraw" achievement by opening a priority issue and archiving it within seconds.
- **Workflow**: Create Issue ➡️ Wait 2s ➡️ Close Issue.

### 🚀 YOLO Badge
Automates the YOLO achievement through a sophisticated "reviewer-attributed" merge flow.
- **Requirements**: Repository must be **PUBLIC**.
- **Workflow**: Create Branch ➡️ Commit with Reviewer Co-author ➡️ Open PR ➡️ Request Review ➡️ Auto-Merge ➡️ Cleanup Branch.

### 🔀 Pull Requests (Batch)
Automates the creation and merging of multiple Pull Requests to streamline repository updates.
- **Workflow**: Create Branch ➡️ Create File ➡️ Create PR ➡️ Auto-Merge ➡️ Cleanup.

### 👥 Pair Suite (Pair Extraordinaire)
Facilitates the "Pair Extraordinaire" achievement by automating PRs with multiple co-authors.
- **Workflow**: Create Branch ➡️ Multi-author Commit ➡️ Open PR ➡️ Auto-Merge ➡️ Cleanup.

---

## 🛠️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/SIMARSINGHRAYAT/GITHUB_BULK_MANAGER.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

### 🚢 Deployment (Vercel)
This project is optimized for deployment on **Vercel**.
1. Push your code to your GitHub repository.
2. Import the project into Vercel.
3. Vercel will auto-detect **Vite** settings.
4. Click **Deploy**.

> [!TIP]
> This project uses `vite-plugin-singlefile` to bundle the entire application into a single HTML file, making it extremely portable and easy to serve.

---

## 📖 Usage
1. **Authorize**: Enter your GitHub PAT to begin the session.
2. **Select Repository**: Search for the target repository where you want to execute actions.
3. **Configure**: Select the desired workflow (Quickdraw, YOLO, PRs, or Pair).
4. **Generate & Execute**: Initialize the nodes and click **Execute** to start the automation.

---

## ⚡ Technical Stack
- **Framework**: React 19
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React
- **Language**: TypeScript 5

---

&copy; 2026 GITHUB BULK MANAGER • Premium Achievement Suite
