export const ICP_RECORD = import.meta.env.VITE_ICP_RECORD ?? '';
export const ICP_URL = 'https://beian.miit.gov.cn/';

export default function IcpRecordLink({ className = '' }: { className?: string }) {
  if (!ICP_RECORD) return null;

  return (
    <a
      href={ICP_URL}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {ICP_RECORD}
    </a>
  );
}
