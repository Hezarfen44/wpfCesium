using System;
using System.IO;
using System.Net.Http; // This is no longer strictly needed but keeping it for context
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;

namespace CesiumWpfApp
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            InitializeWebView();
        }

        private async void InitializeWebView()
        {
            await webView.EnsureCoreWebView2Async();

            // Cesium projesini içerdiğin klasör
            string localCesiumPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "webapp");

            // localhost gibi çalışmasını sağla
            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "cesium.local", localCesiumPath,
                CoreWebView2HostResourceAccessKind.Allow);

            // index.html dosyasını yükle
            webView.CoreWebView2.Navigate("http://cesium.local/index.html");

            webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
        }

        private void CoreWebView2_WebMessageReceived(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs e)
        {
            var json = e.WebMessageAsJson;

            // JSON veriyi dynamic olarak al
            dynamic data = Newtonsoft.Json.JsonConvert.DeserializeObject(json);

            if ((string)data.type == "mouseMove")
            {
                double lat = data.lat;
                double lon = data.lon;
                double height = data.height; // Extract height directly

                Dispatcher.Invoke(() =>
                {
                    txtLat.Text = lat.ToString("F6");
                    txtLon.Text = lon.ToString("F6");

                    // Display the height in the txtElev TextBox
                    if (height > -9999) // Check for your "no data" value or use Cesium's undefined
                    {
                        txtElev.Text = height.ToString("F1");
                    }
                    else
                    {
                        txtElev.Text = "N/A"; // Or clear the text, based on preference
                    }
                });
            }
        }
    }
}