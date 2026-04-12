import { useState } from "react";
import { Plus, Trash2, Image, Video, Type, ChevronUp, ChevronDown } from "lucide-react";

interface ContentBlock {
  type: "text" | "image" | "video";
  value: string;
}

function parseHtmlToBlocks(html: string): ContentBlock[] {
  if (!html || !html.trim()) return [];
  const blocks: ContentBlock[] = [];
  const div = document.createElement("div");
  div.innerHTML = html;

  for (const node of Array.from(div.childNodes)) {
    if (node instanceof HTMLImageElement) {
      blocks.push({ type: "image", value: node.src });
    } else if (node instanceof HTMLIFrameElement) {
      blocks.push({ type: "video", value: node.src });
    } else if (node instanceof HTMLVideoElement) {
      blocks.push({ type: "video", value: node.src });
    } else if (node instanceof HTMLElement) {
      const img = node.querySelector("img");
      const iframe = node.querySelector("iframe");
      const video = node.querySelector("video");
      if (img && !node.textContent?.trim()) {
        blocks.push({ type: "image", value: img.src });
      } else if (iframe) {
        blocks.push({ type: "video", value: iframe.src });
      } else if (video) {
        blocks.push({ type: "video", value: video.src });
      } else {
        const text = node.textContent?.trim();
        if (text) blocks.push({ type: "text", value: node.innerHTML || text });
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push({ type: "text", value: text });
    }
  }
  return blocks.length > 0 ? blocks : html.trim() ? [{ type: "text", value: html }] : [];
}

function blocksToHtml(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "image" && b.value.trim()) {
        return `<img src="${b.value.trim()}" style="max-width:100%;border-radius:8px;margin:8px 0;" />`;
      }
      if (b.type === "video" && b.value.trim()) {
        const url = b.value.trim();
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
      if (ytMatch) {
          return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}?playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen playsinline webkit-playsinline style="width:100%;aspect-ratio:16/9;border-radius:8px;margin:8px 0;"></iframe>`;
        }
        const biliMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
        if (biliMatch) {
          return `<iframe src="//player.bilibili.com/player.html?bvid=${biliMatch[1]}&high_quality=1&danmaku=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen sandbox="allow-top-navigation allow-same-origin allow-forms allow-scripts allow-popups" scrolling="no" style="width:100%;aspect-ratio:16/9;border-radius:8px;margin:8px 0;"></iframe>`;
        }
        if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
          return `<video src="${url}" controls playsinline webkit-playsinline preload="metadata" style="width:100%;border-radius:8px;margin:8px 0;"></video>`;
        }
        return `<iframe src="${url}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen playsinline webkit-playsinline style="width:100%;aspect-ratio:16/9;border-radius:8px;margin:8px 0;"></iframe>`;
      }
      if (b.type === "text" && b.value.trim()) {
        if (/<[^>]+>/.test(b.value)) return b.value;
        return `<p>${b.value}</p>`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

interface Props {
  content: string;
  onChange: (html: string) => void;
}

export default function TutorialContentEditor({ content, onChange }: Props) {
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => parseHtmlToBlocks(content));

  const update = (newBlocks: ContentBlock[]) => {
    setBlocks(newBlocks);
    onChange(blocksToHtml(newBlocks));
  };

  const addBlock = (type: ContentBlock["type"]) => {
    update([...blocks, { type, value: "" }]);
  };

  const updateBlock = (index: number, value: string) => {
    const newBlocks = [...blocks];
    newBlocks[index] = { ...newBlocks[index], value };
    update(newBlocks);
  };

  const removeBlock = (index: number) => {
    update(blocks.filter((_, i) => i !== index));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[target]] = [newBlocks[target], newBlocks[index]];
    update(newBlocks);
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs text-muted-foreground mb-1">教程内容</label>

      {blocks.length === 0 && (
        <div className="text-center text-muted-foreground py-6 border border-dashed border-border rounded-lg text-sm">
          点击下方按钮添加内容块
        </div>
      )}

      {blocks.map((block, i) => (
        <div key={i} className="flex gap-2 items-start group">
          <div className="flex flex-col gap-0.5 pt-1">
            <button onClick={() => moveBlock(i, -1)} disabled={i === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5" title="上移">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-0.5" title="下移">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1">
            {block.type === "text" && (
              <div className="relative">
                <div className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none">
                  <Type className="w-3.5 h-3.5" />
                </div>
                <textarea
                  value={block.value.replace(/<\/?p>/g, "")}
                  onChange={e => updateBlock(i, e.target.value)}
                  placeholder="输入文本内容..."
                  className="w-full border border-input pl-8 pr-3 py-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-client-primary outline-none min-h-[60px] resize-y"
                />
              </div>
            )}
            {block.type === "image" && (
              <div className="space-y-1.5">
                <div className="relative">
                  <div className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none">
                    <Image className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={block.value}
                    onChange={e => updateBlock(i, e.target.value)}
                    placeholder="粘贴图片链接 https://..."
                    className="w-full border border-input pl-8 pr-3 py-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-client-primary outline-none"
                  />
                </div>
                {block.value && (
                  <img src={block.value} alt="预览" className="max-h-32 rounded-lg border border-border" onError={e => (e.currentTarget.style.display = "none")} />
                )}
              </div>
            )}
            {block.type === "video" && (
              <div className="relative">
                <div className="absolute left-2.5 top-2.5 text-muted-foreground pointer-events-none">
                  <Video className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  value={block.value}
                  onChange={e => updateBlock(i, e.target.value)}
                  placeholder="粘贴视频链接 (YouTube / Bilibili / MP4直链)"
                  className="w-full border border-input pl-8 pr-3 py-2 rounded-lg text-sm bg-background focus:ring-2 focus:ring-client-primary outline-none"
                />
              </div>
            )}
          </div>

          <button onClick={() => removeBlock(i)}
            className="text-destructive/60 hover:text-destructive p-1.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" title="删除此块">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button onClick={() => addBlock("text")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-secondary-foreground hover:opacity-80 border border-border transition-colors">
          <Type className="w-3.5 h-3.5" /> 添加文本
        </button>
        <button onClick={() => addBlock("image")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-secondary-foreground hover:opacity-80 border border-border transition-colors">
          <Image className="w-3.5 h-3.5" /> 添加图片
        </button>
        <button onClick={() => addBlock("video")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-secondary text-secondary-foreground hover:opacity-80 border border-border transition-colors">
          <Video className="w-3.5 h-3.5" /> 添加视频
        </button>
      </div>
    </div>
  );
}
