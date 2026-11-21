UPDATE public.admin_config
SET software_update_enabled = true,
    software_latest_version = '0.3.0',
    software_windows_download_url = 'https://github.com/gdspns/jiedianshangcheng3.0/releases/download/desktop-v0.3.0/IP520-Setup-0.3.0-x64.exe',
    software_update_notes = '首个支持后台管理自动更新的 Windows 版本。新增订阅分组、多协议节点、商城自助购买、连接模式与中转功能。',
    software_force_update = false;
