# JL addon transfer

Settings → Account → JL account → Installed addons now offers Save addons and Restore addons. Sign in and link the device to the same JL profile on each device. Save after configuring MediaFusion or another compatible addon, then restore on the destination.

This is an explicit backup, not automatic synchronization. Each save replaces the prior backup for that account/profile; an empty device cannot erase the backup. Restore adds missing exact transport URLs and retains existing installations, configurations, enabled flags and display order. Cached manifests are not transferred; existing addon loading fetches fresh manifests as needed. Local-network addons can still require device-specific setup.

Configured URLs can contain credentials. They are sent only through the existing authenticated media.set_secret/get_secrets RPCs, under addon-backup:v1:<remote-profile-id>. The existing SQL encrypts these values in media.secrets and limits reads/writes to auth.uid(). They are excluded from the ordinary profile document, logs and conflict exports. No new schema, keys, provider calls or database mutation are required to install this code. Runtime Save performs the requested account write.

Account/profile ownership is captured before requests and checked again before local mutation. Shared-addon profiles must be selected at their owning local profile. Restore reads local state after its network wait so installations made during that wait survive. Malformed, oversized, wrong-profile and missing backups fail without changing installed addons.

Prerequisite: the deployed JL build must have its existing account configuration and working encrypted secrets RPCs. Source and fixture verification do not establish that the production database functions are deployed or that Shield playback works.
