# Installing claude-village

1. Download `claude-village-<version>.dmg` from the latest GitHub release.
2. Mount the DMG and drag `claude-village.app` to Applications.
3. First launch will be blocked by macOS Gatekeeper. From Terminal:

   ```bash
   xattr -d com.apple.quarantine /Applications/claude-village.app
   ```

4. Open the app. Start a Claude Code session in a terminal - it will appear as a tab.

Proper code signing and notarization will land in a future release.

## Notes

- The app icon (`build/icon.png`) is a placeholder brick graphic until proper branding lands.
