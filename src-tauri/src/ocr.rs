//! 图片文字识别：使用 Windows 系统自带 OCR（Windows.Media.Ocr），
//! 中文识别依赖系统语言包（zh-CN），全程本地离线。

#[cfg(windows)]
mod imp {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapDecoder, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
    use windows::Win32::System::Com::CoIncrementMTAUsage;

    type OcrResult = Result<Vec<String>, String>;

    fn ensure_winrt_apartment() {
        // tokio 工作线程默认没有初始化 COM；幂等提升为 MTA 即可使用 WinRT。
        unsafe {
            let _ = CoIncrementMTAUsage();
        }
    }

    fn create_engine() -> Result<OcrEngine, String> {
        unsafe {
            let zh = Language::CreateLanguage(&HSTRING::from("zh-CN"))
                .map_err(|error| format!("初始化中文语言失败：{error}"))?;
            if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&zh) {
                return Ok(engine);
            }
            OcrEngine::TryCreateFromUserProfileLanguages().map_err(|_| {
                "系统未安装可用的 OCR 语言包，请在 Windows 设置中添加中文语言".to_string()
            })
        }
    }

    pub fn ocr_image_bytes(bytes: &[u8]) -> OcrResult {
        ensure_winrt_apartment();

        unsafe {
            let stream = InMemoryRandomAccessStream::new()
                .map_err(|error| format!("创建图片流失败：{error}"))?;
            let writer = DataWriter::CreateDataWriter(&stream)
                .map_err(|error| format!("创建写入器失败：{error}"))?;
            writer
                .WriteBytes(bytes)
                .map_err(|error| format!("写入图片数据失败：{error}"))?;
            writer
                .StoreAsync()
                .map_err(|error| format!("暂存图片数据失败：{error}"))?
                .get()
                .map_err(|error| format!("暂存图片数据失败：{error}"))?;
            writer
                .FlushAsync()
                .map_err(|error| format!("提交图片数据失败：{error}"))?
                .get()
                .map_err(|error| format!("提交图片数据失败：{error}"))?;
            let _ = writer.DetachStream();
            stream
                .Seek(0)
                .map_err(|error| format!("重置图片流失败：{error}"))?;

            let bitmap: SoftwareBitmap = BitmapDecoder::CreateAsync(&stream)
                .map_err(|error| format!("解码图片失败：{error}"))?
                .get()
                .map_err(|error| format!("解码图片失败：{error}"))?
                .GetSoftwareBitmapAsync()
                .map_err(|error| format!("读取位图失败：{error}"))?
                .get()
                .map_err(|error| format!("读取位图失败：{error}"))?;

            let engine = create_engine()?;
            let max_dimension = OcrEngine::MaxImageDimension()
                .map_err(|error| format!("查询 OCR 上限失败：{error}"))?;
            let width = bitmap.PixelWidth().unwrap_or(0);
            let height = bitmap.PixelHeight().unwrap_or(0);
            if width < 0 || height < 0 {
                return Err("图片内容为空".to_string());
            }
            let (width, height) = (width as u32, height as u32);
            if width == 0 || height == 0 {
                return Err("图片内容为空".to_string());
            }
            if width > max_dimension || height > max_dimension {
                return Err(format!(
                    "图片尺寸 {width}x{height} 超过系统 OCR 上限 {max_dimension}，请截小一点再试"
                ));
            }

            let result = engine
                .RecognizeAsync(&bitmap)
                .map_err(|error| format!("识别失败：{error}"))?
                .get()
                .map_err(|error| format!("识别失败：{error}"))?;
            let lines = result
                .Lines()
                .map_err(|error| format!("读取识别结果失败：{error}"))?;
            let mut texts = Vec::new();
            for line in lines {
                let text = line
                    .Text()
                    .map_err(|error| format!("读取识别文本失败：{error}"))?
                    .to_string();
                let trimmed = text.trim().to_string();
                if !trimmed.is_empty() {
                    texts.push(trimmed);
                }
            }
            Ok(texts)
        }
    }
}

#[cfg(windows)]
pub fn ocr_image_bytes(bytes: &[u8]) -> Result<Vec<String>, String> {
    imp::ocr_image_bytes(bytes)
}

#[cfg(not(windows))]
pub fn ocr_image_bytes(_bytes: &[u8]) -> Result<Vec<String>, String> {
    Err("图片识别仅支持 Windows".to_string())
}
