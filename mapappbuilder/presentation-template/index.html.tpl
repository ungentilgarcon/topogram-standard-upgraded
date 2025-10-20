<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{TITLE}}</title>
  <link rel="stylesheet" href="styles/main.css" />
  <link rel="stylesheet" href="styles/custom.css" />
  <link rel="icon" type="image/png" href="favicon.png" />
</head>
<body>
  <div id="app">
    <header>
      <img src="images/logo.png" alt="logo" style="height:48px; vertical-align:middle; margin-right:8px;" />
      <h1 style="display:inline-block; vertical-align:middle;">{{TITLE}}</h1>
    </header>
    <main>
      <div id="map" style="width:60%; height:600px; float:left;"></div>
      <div id="network" style="width:40%; height:600px; float:right;"></div>
    </main>
    <footer>
      <small>Exported Topogram</small>
    </footer>
  </div>
  <script src="app.js"></script>
</body>
</html>
