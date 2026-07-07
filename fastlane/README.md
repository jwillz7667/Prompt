fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios release_status

```sh
[bundle exec] fastlane ios release_status
```

Show live App Store and current TestFlight release state

### ios prepare_release

```sh
[bundle exec] fastlane ios prepare_release
```

Sync version/build numbers for the next App Store build

### ios build_release

```sh
[bundle exec] fastlane ios build_release
```

Create a signed App Store archive and IPA locally without uploading

### ios release_candidate

```sh
[bundle exec] fastlane ios release_candidate
```

Prepare the next build and create the local release artifacts

### ios upload_testflight_release

```sh
[bundle exec] fastlane ios upload_testflight_release
```

Upload the current archive/IPA to TestFlight

### ios upload_store_listing

```sh
[bundle exec] fastlane ios upload_store_listing
```

Upload App Store metadata and screenshots without uploading a binary

### ios submit_review

```sh
[bundle exec] fastlane ios submit_review
```

Submit the prepared App Store version for review (binary already uploaded)

### ios screenshots

```sh
[bundle exec] fastlane ios screenshots
```

Capture App Store screenshots

### ios frame_marketing_screenshots

```sh
[bundle exec] fastlane ios frame_marketing_screenshots
```

Frame screenshots with device frames

### ios marketing_screenshots

```sh
[bundle exec] fastlane ios marketing_screenshots
```

Generate and frame all screenshots

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
