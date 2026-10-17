'use client';

import * as React from 'react';
import { KeyRound, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button, Drawer, StatusDot, useToast } from '@/components/ui';
import { GameModeBadge, ServerAddress } from '@/components/servers';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { deliverableNote, formatDateTime, serverTitle, type ServerRow } from '../_lib';

export interface ServerDetailDrawerProps {
  server: ServerRow | null;
  duplicateOf: ServerRow[];
  onOpenChange: (open: boolean) => void;
  onEdit: (server: ServerRow) => void;
  onRegenerateKey: (server: ServerRow) => void;
  onDelete: (server: ServerRow) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[132px_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4">
      <h3 className="mb-1 text-xs font-medium text-fg-subtle">{title}</h3>
      <dl className="divide-y divide-line">{children}</dl>
    </section>
  );
}

const dash = <span className="text-fg-subtle">—</span>;

export function ServerDetailDrawer({ server, duplicateOf, onOpenChange, onEdit, onRegenerateKey, onDelete }: ServerDetailDrawerProps) {
  const toast = useToast();
  const { copy } = useCopyToClipboard();

  if (!server) return null;
  // Only rendered after a row is opened on the client, so window is available.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const note = deliverableNote(server);
  const pluginConfig = `{
  "HeartShop": {
    "ApiUrl": "${origin || 'https://<โดเมน>'}/api/plugin",
    "ServerId": ${server.id}
  }
}`;

  return (
    <Drawer
      open={!!server}
      onOpenChange={onOpenChange}
      size="lg"
      title={serverTitle(server)}
      description={server.displayName && server.displayName !== server.name ? server.name : undefined}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="danger" size="sm" leftIcon={<Trash2 className="h-4 w-4" strokeWidth={1.5} />} onClick={() => onDelete(server)}>
            ลบ
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<KeyRound className="h-4 w-4" strokeWidth={1.5} />}
              onClick={() => onRegenerateKey(server)}
            >
              สร้างคีย์ใหม่
            </Button>
            <Button size="sm" leftIcon={<Pencil className="h-4 w-4" strokeWidth={1.5} />} onClick={() => onEdit(server)}>
              แก้ไข
            </Button>
          </div>
        </div>
      }
    >
      <div className="divide-y divide-line">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <GameModeBadge mode={server.gameMode} />
          <StatusDot status={server.online ? 'online' : 'offline'} label />
          {server.deliverable ? <Badge tone="success">รับของได้</Badge> : <Badge>ยังไม่รับของ</Badge>}
          {server.drainMode ? <Badge tone="warning">พักรับของ</Badge> : null}
          {!server.isActive ? <Badge tone="danger" outline>ปิดใช้งาน</Badge> : null}
        </div>

        {duplicateOf.length ? (
          <p role="status" className="mx-5 my-4 rounded-control border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            ที่อยู่ซ้ำกับ {duplicateOf.map((s) => serverTitle(s)).join(', ')} ผู้เล่นอาจเข้าผิดเซิร์ฟเวอร์ ตรวจสอบพอร์ตกับเซิร์ฟเวอร์จริง
          </p>
        ) : null}

        <Section title="รายชื่อเซิร์ฟเวอร์">
          <Row label="ID">
            <span className="font-mono">{server.id}</span>
          </Row>
          <Row label="แผนที่">{server.map ? <span className="font-mono">{server.map}</span> : dash}</Row>
          <Row label="กลุ่ม">{server.cluster?.name ?? dash}</Row>
          <Row label="ที่อยู่">
            <ServerAddress host={server.connectHost} port={server.connectPort} showConnect={false} />
          </Row>
          <Row label="อัตรา">{server.rates ? <span className="font-mono">{server.rates}</span> : dash}</Row>
          <Row label="ม็อด">{server.isModded ? 'ลงม็อด' : 'ไม่ลงม็อด'}</Row>
          <Row label="แสดงในรายชื่อ">{server.isListed ? 'แสดง' : 'ซ่อน'}</Row>
          <Row label="ให้บริการ">{server.isAvailable ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}</Row>
          <Row label="ลำดับ">
            <span className="font-mono">{server.sortOrder}</span>
          </Row>
          {server.directoryKey ? (
            <Row label="คีย์ seed">
              <span className="font-mono text-xs">{server.directoryKey}</span>
            </Row>
          ) : null}
        </Section>

        <Section title="การส่งของและปลั๊กอิน">
          <Row label="รับของจากร้าน">{note ? <span className="text-fg-muted">{note}</span> : 'พร้อม'}</Row>
          <Row label="credential ที่ใช้งาน">
            <span className="font-mono">{server.activeCredentialCount ?? 0}</span>
          </Row>
          <Row label="heartbeat ล่าสุด">{formatDateTime(server.lastHeartbeat)}</Row>
          <Row label="ผู้เล่นออนไลน์">
            <span className="font-mono">{server.playerCount}</span>
          </Row>
          <Row label="เวอร์ชันปลั๊กอิน">{server.pluginVersion ? <span className="font-mono">{server.pluginVersion}</span> : dash}</Row>
          <Row label="build hash">
            {server.pluginBuildHash ? <span className="font-mono text-xs">{server.pluginBuildHash.slice(0, 16)}…</span> : dash}
          </Row>
          <Row label="protocol">{server.protocolVersion ? <span className="font-mono">{server.protocolVersion}</span> : dash}</Row>
          <Row label="ความสามารถ">
            {server.capabilities?.length ? (
              <span className="flex flex-wrap gap-1">
                {server.capabilities.map((c) => (
                  <Badge key={c} mono>
                    {c}
                  </Badge>
                ))}
              </span>
            ) : (
              dash
            )}
          </Row>
          <Row label="คีย์ API แบบเดิม">
            {server.apiKey ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-fg-muted">••••{server.apiKey.slice(-4)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (await copy(server.apiKey ?? '')) toast.success('คัดลอกคีย์แล้ว', 'เก็บไว้ในที่ปลอดภัย อย่าวางในแชท');
                    else toast.error('คัดลอกไม่สำเร็จ', 'เบราว์เซอร์ไม่อนุญาตให้เข้าถึงคลิปบอร์ด');
                  }}
                >
                  คัดลอกคีย์
                </Button>
              </span>
            ) : (
              dash
            )}
          </Row>
        </Section>

        <section className="px-5 py-4">
          <h3 className="mb-2 text-xs font-medium text-fg-subtle">ตั้งค่าปลั๊กอิน</h3>
          <p className="mb-2 text-xs text-fg-muted">
            ใส่ค่าเหล่านี้ใน config.json ของ HeartShop พร้อม credential ที่ออกให้เซิร์ฟเวอร์นี้
          </p>
          <pre className="overflow-x-auto rounded-control border border-line bg-canvas p-3 font-mono text-xs leading-relaxed text-fg">
            {pluginConfig}
          </pre>
        </section>

        <Section title="บันทึก">
          <Row label="สร้างเมื่อ">{formatDateTime(server.createdAt)}</Row>
          <Row label="แก้ไขล่าสุด">{formatDateTime(server.updatedAt)}</Row>
        </Section>
      </div>
    </Drawer>
  );
}

export default ServerDetailDrawer;
