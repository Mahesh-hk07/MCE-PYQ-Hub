# MCE PYQ Hub - Android Application Project

This folder contains the complete, native Android application project for **MCE PYQ Hub (Malnad College of Engineering)**.

---

## 📱 Features Included in this Android App

1. **Full Screen Native Experience**: No browser address bars or tabs.
2. **Hardware Back Button Handling**: Tapping your phone's back button navigates backwards through questions and subjects instead of closing the app.
3. **Pull-to-Refresh**: Swipe down from top to refresh the question papers repository.
4. **Native PDF Download Manager**: Clicking any "View PDF" or "Download" saves the question paper directly into the student's Android `Downloads` folder with progress notifications.
5. **App Icon & Branding**: Official Malnad College of Engineering crest icon across all screen densities (MDPI to XXXHDPI).

---

## 🛠️ How to Build the `.apk` File

### Method 1: Using Android Studio (Recommended)
1. Open **Android Studio**.
2. Click **Open** and select this directory:
   `c:\Users\mayab\OneDrive\Desktop\MCE-PYQ-Hub\android-app`
3. Wait for Gradle to finish syncing dependencies.
4. In the top menu, go to:
   **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
5. Once complete, Android Studio will show a popup at the bottom right:
   `APK(s) generated successfully. [locate]`
6. Click **locate** to get `app-debug.apk`. You can rename this to `MCE-PYQ-Hub.apk` and share it directly on WhatsApp, Telegram, or Google Drive with all MCE students!

---

## 🌐 Changing the App Server URL

In `app/src/main/java/com/mce/pyqhub/MainActivity.java`:
Line 30:
```java
public static final String APP_URL = "http://10.0.2.2:8000/";
```
- For testing on your local phone connected to the same Wi-Fi, change `10.0.2.2` to your computer's local IP address (e.g. `http://192.168.1.15:8000/`).
- When your website is deployed live on a domain (e.g., `https://mcepyqhub.in` or `https://mce.ac.in`), change it to your live HTTPS domain!

