# RPG Save Editor

RPG Save Editor is a desktop application built using Tauri and React, designed for editing save files of RPG games.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or newer)
- System dependencies for Tauri - follow the [Tauri setup guide](https://tauri.app/start/prerequisites/)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/truongthang2211/RPGSaveEditor.git
cd RPGSaveEditor
```

2. Install dependencies:
```bash
npm install
```

### Development Commands

- Start development server:
```bash
npm run tauri dev
```

- Build for production:
```bash
npm run tauri build
```

The built application will be available in the `src-tauri/target/release` directory.

## Support Us

If you find this tool useful, please consider supporting us:

[![Buy Me a Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/truongthang2211)
[![PayPal](https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg)](https://www.paypal.me/truongthang2211)

## Screenshots

![image](https://github.com/user-attachments/assets/63712b7e-c9c7-4ddc-ad5a-d7c8c5bea7cd)
*Main interface of RPG Save Editor*

![image](https://github.com/user-attachments/assets/25e63f51-1f8c-4c62-b61e-0bed689237ef)
*Main interface of RPG Save Editor with dark mode enabled.*

## Features

- Open and edit RPG Maker MV (`.rpgsave`, LZ-String) and MZ (`.rmmzsave`, pako/zlib) save files.
- Modify game data such as party, items, switches, and variables.
- Supports light and dark modes.
- Easy-to-use interface with file selection and reload options.
- Sidebar navigation with sections for Party, Items, Switches, and Variables.
- About section with information and donation options.

## Technologies Used

- **[Tauri](https://tauri.app/)**: For building the desktop application.
- **[React](https://reactjs.org/)**: For creating the user interface.
- **[Styled-components](https://styled-components.com/)**: For styling the application.
- **[Lodash](https://lodash.com/)**: For utility functions and data manipulation.

## Usage

1. Launch the application.
2. Click on the file icon to open a `.rpgsave` (MV) or `.rmmzsave` (MZ) file.
3. Edit the desired data using the available sections in the sidebar.
4. Save your changes or reload the file if needed.

## Download

You can download the latest release of RPG Save Editor from the [Releases](https://github.com/truongthang2211/RPGSaveEditor/releases) page. The release includes:

- A standalone executable file (`.exe`) for users who already have the necessary dependencies installed.
- A setup installer (`setup.exe`) for users who may need to install additional dependencies.

If the standalone `.exe` file does not run on your system, please use the `setup.exe` to install the required software and try again.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Common Development Issues

1. **Rust toolchain issues**
   - Make sure you have the latest stable Rust toolchain installed
   - Run `rustup update` to update your Rust installation

2. **Build errors**
   - Ensure all dependencies are installed with `npm install`
   - Check that you have the required system dependencies for Tauri
   - Clear the build cache: `cargo clean` in the `src-tauri` directory

3. **Development server issues**
   - Try clearing the npm cache: `npm cache clean --force`
   - Ensure no other process is using port 1420 (default Vite port)

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
