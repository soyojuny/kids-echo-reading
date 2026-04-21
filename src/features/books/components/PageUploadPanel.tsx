"use client";

type PageUploadPanelProps = {
  disabled?: boolean;
  onUpload: (files: File[]) => void;
};

export function PageUploadPanel({ disabled, onUpload }: PageUploadPanelProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }

    onUpload(files);
    event.currentTarget.value = "";
  };

  return (
    <article className="panel">
      <h2>다중 페이지 업로드</h2>
      <p className="muted">파일명을 기준으로 자동 정렬됩니다. 예: `page-1.jpg`, `page-2.jpg`</p>
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        onChange={handleChange}
        style={{ marginTop: "0.75rem" }}
      />
    </article>
  );
}
