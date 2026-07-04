type Props = {
  videoId: string;
  title?: string;
};

export function YoutubeEmbed({ videoId, title = 'YouTube video' }: Props) {
  return (
    <div className="relative aspect-video w-full overflow-hidden border border-border bg-black">
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}
