---
applyTo: '**'
---
we are in topogram, an app to vizualize networks and geomaps.

this branch, mapappbuilder has its own folder, called  mapappbuilder, which contains the code for building custom map applications. The folder structure is organized to separate the core functionality of the app from the custom components being developed. mappappbuilder uses a json configuration file to define the parameters and settings for the custom map applications, file is called mapappbuilder/config/mapapp_config.json. This file allows developers to specify various options for the map applications, such as data sources, visualization styles, and user interface elements.
The mapappbuilder folder contains several subfolders, including:
- components: This folder contains reusable components that can be used across different map applications. These components may include map layers, legends, tooltips, and other UI elements.
- utils: This folder contains utility functions and helper methods that support the core functionality of the map applications. These utilities may include data processing functions, API integrations, and other common tasks.
- styles: This folder contains the styling files for the map applications, including CSS or SCSS files that define the visual appearance of the app.
- tests: This folder contains test files to ensure the functionality and reliability of the map applications. These tests may include unit tests, integration tests, and end-to-end tests.

The mapappbuilder branch is designed to facilitate the development of custom map applications by providing a structured framework and reusable components. Developers can easily modify the configuration file and utilize the components and utilities provided in the folder structure to create tailored map applications that meet specific requirements.
The main entry point for the mapappbuilder is typically an index.js or app.js file located in the root of the mapappbuilder folder. This file initializes the application, loads the configuration settings from the JSON file, and renders the map application using the specified components and styles.
Overall, the mapappbuilder branch provides a dedicated environment for building custom map applications within the topogram project, allowing for flexibility and scalability in developing geospatial visualization tools.
.sandboxapp is another folder in this branch, which contains a sandbox environment for testing and experimenting with the map applications. This folder allows developers to quickly prototype and iterate on new features and functionalities without affecting the main application. The sandboxapp folder may include sample data, test cases, and experimental components that can be used to validate ideas and concepts before integrating them into the main mapappbuilder codebase.
It is updated with the main branch of topogram to ensure compatibility and access to the latest features and improvements. This synchronization helps maintain consistency between the mapappbuilder and the core topogram application, allowing developers to leverage new functionalities and enhancements as they are introduced via the bash script sync_sandbox.sh.


When we are in this branch, we can still access the main topogram application features and functionalities. The mapappbuilder branch is designed to work seamlessly with the core topogram codebase, allowing developers to utilize the existing network visualization and geomap rendering capabilities while building custom map applications. This integration ensures that the mapappbuilder can leverage the strengths of the topogram application while providing a dedicated environment for customization and experimentation.
HOWEVER when we are in this branch you SHOULD NOT make changes to the core topogram codebase directly. Instead, any modifications or enhancements should be made within the mapappbuilder folder structure to ensure that the custom map applications remain separate from the main application logic. This separation helps maintain the integrity of the core topogram codebase and allows for easier maintenance and updates in the future.
