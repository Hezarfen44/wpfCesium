Project Description
This project is a hybrid desktop application that integrates a Cesium-based globe within a WPF (Windows Presentation Foundation) framework. By utilizing WebView technology, it combines the robust user interface capabilities of .NET with the high-performance 3D rendering of JavaScript/CesiumJS.

The application is specifically engineered to operate in a fully offline environment, providing seamless visualization of satellite imagery and terrain data without external internet dependencies.

Key Features
Hybrid Architecture (WPF & JavaScript): Uses a WebView component to embed the CesiumJS engine inside a native Windows desktop application.

Integrated User Interface: Features a comprehensive internal UI built with WPF to control map interactions, layers, and analysis tools.

Fully Offline Capability: Operates without any internet connection, making it suitable for secure or isolated environments.

Satellite Imagery: Fetches high-resolution satellite tiles via WMS (Web Map Service) through a local GeoServer instance.

3D Terrain Visualization: Retrieves DEM (Digital Elevation Model) data in RGB format from GeoServer, converting it into a realistic 3D terrain structure within the Cesium environment.

Technical Workflow
Application Core: The main application runs on WPF, providing the window management and user interface controls.

Map Embedding: A WebView control hosts the JavaScript-based Cesium viewer, acting as a bridge between the desktop environment and the web map.

Data Source: GeoServer acts as the primary local map server.

Imagery: Standard satellite layers are served as WMS layers.

Terrain: RGB-encoded DEM data is processed and rendered to provide realistic 3D topography.
