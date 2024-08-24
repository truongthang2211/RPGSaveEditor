# RPG Save Editor

RPG Save Editor is a desktop application built using Tauri and React, designed for editing save files of RPG games.

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

- Open and edit `.rpgsave` files.
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

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/truongthang2211/RPGSaveEditor.git
    cd RPGSaveEditor
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Build the Tauri app:
    ```bash
    npm run tauri build
    ```

## Usage

1. Launch the application.
2. Click on the file icon to open a `.rpgsave` file.
3. Edit the desired data using the available sections in the sidebar.
4. Save your changes or reload the file if needed.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
