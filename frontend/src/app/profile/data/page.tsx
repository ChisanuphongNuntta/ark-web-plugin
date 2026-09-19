'use client';

import { useAuthStore } from '@/lib/store';
import { useQuery, useMutation } from '@tanstack/react-query';
import { pdpaApi } from '@/lib/api';
import { useState } from 'react';
import {
  Download,
  Trash2,
  Loader2,
  AlertTriangle,
  FileText,
  Clock,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';

export default function DataManagementPage() {
  const { user } = useAuthStore();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const { data: requestsData, refetch: refetchRequests } = useQuery({
    queryKey: ['my-data-requests'],
    queryFn: () => pdpaApi.getMyRequests().then(res => res.data),
    enabled: !!user,
  });

  const exportMutation = useMutation({
    mutationFn: () => pdpaApi.exportData(),
    onSuccess: (response) => {
      // Download as JSON file
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: ({ type, description }: { type: string; description?: string }) =>
      pdpaApi.createRequest(type, description),
    onSuccess: () => {
      refetchRequests();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => pdpaApi.deleteData('DELETE_MY_DATA'),
    onSuccess: () => {
      // Logout and redirect
      window.location.href = '/';
    },
  });

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">กรุณาเข้าสู่ระบบ</p>
      </div>
    );
  }

  const handleDelete = () => {
    if (deleteConfirmation === 'DELETE_MY_DATA') {
      deleteMutation.mutate();
    }
  };

  const requestTypes = [
    { type: 'access', label: 'ขอเข้าถึงข้อมูล', description: 'ขอดูข้อมูลส่วนบุคคลทั้งหมดที่เราเก็บ' },
    { type: 'rectification', label: 'ขอแก้ไขข้อมูล', description: 'ขอแก้ไขข้อมูลที่ไม่ถูกต้อง' },
    { type: 'objection', label: 'ขอคัดค้านการประมวลผล', description: 'คัดค้านการใช้ข้อมูลบางประเภท' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/profile" className="text-gray-400 hover:text-white text-sm">
            &larr; กลับโปรไฟล์
          </Link>
          <h1 className="text-3xl font-bold mt-2">จัดการข้อมูลส่วนบุคคล</h1>
        </div>
      </div>

      {/* Export Data */}
      <div className="card p-6">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Download className="h-6 w-6 text-blue-400" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold">ดาวน์โหลดข้อมูลของคุณ</h3>
            <p className="text-sm text-gray-400 mt-1">
              รับสำเนาข้อมูลส่วนบุคคลทั้งหมดในรูปแบบ JSON
            </p>
          </div>
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="btn btn-primary"
          >
            {exportMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                ดาวน์โหลด
              </>
            )}
          </button>
        </div>
      </div>

      {/* Data Requests */}
      <div className="card p-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <FileText className="h-6 w-6" />
          ส่งคำขอเกี่ยวกับข้อมูล
        </h3>

        <div className="space-y-3">
          {requestTypes.map((rt) => (
            <div
              key={rt.type}
              className="flex items-center justify-between p-4 bg-black/40 rounded-lg"
            >
              <div>
                <h4 className="font-medium">{rt.label}</h4>
                <p className="text-sm text-gray-400">{rt.description}</p>
              </div>
              <button
                onClick={() => createRequestMutation.mutate({ type: rt.type })}
                disabled={createRequestMutation.isPending}
                className="btn btn-secondary"
              >
                ส่งคำขอ
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Request History */}
      {requestsData?.requests && requestsData.requests.length > 0 && (
        <div className="card p-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-6 w-6" />
            ประวัติคำขอ
          </h3>

          <div className="space-y-3">
            {requestsData.requests.map((req: any) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-4 bg-black/40 rounded-lg"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {req.requestType === 'access' && 'ขอเข้าถึงข้อมูล'}
                      {req.requestType === 'rectification' && 'ขอแก้ไขข้อมูล'}
                      {req.requestType === 'deletion' && 'ขอลบข้อมูล'}
                      {req.requestType === 'portability' && 'ขอโอนย้ายข้อมูล'}
                      {req.requestType === 'objection' && 'ขอคัดค้าน'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        req.status === 'completed'
                          ? 'bg-green-500/20 text-green-400'
                          : req.status === 'rejected'
                          ? 'bg-red-500/20 text-red-400'
                          : req.status === 'processing'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {req.status === 'completed' && 'เสร็จสิ้น'}
                      {req.status === 'rejected' && 'ปฏิเสธ'}
                      {req.status === 'processing' && 'กำลังดำเนินการ'}
                      {req.status === 'pending' && 'รอดำเนินการ'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {new Date(req.createdAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
                {req.response && (
                  <p className="text-sm text-gray-400 max-w-xs">{req.response}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Account */}
      <div className="card p-6 border-red-500/50">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <Trash2 className="h-6 w-6 text-red-400" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-red-400">ลบบัญชีและข้อมูล</h3>
            <p className="text-sm text-gray-400 mt-1">
              การดำเนินการนี้จะลบข้อมูลส่วนบุคคลของคุณอย่างถาวรและไม่สามารถกู้คืนได้
              Iris Coin และประวัติการซื้อจะถูกลบทั้งหมด
            </p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            ลบบัญชี
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <AlertTriangle className="h-8 w-8" />
              <h2 className="text-xl font-bold">ยืนยันการลบบัญชี</h2>
            </div>

            <p className="text-gray-300 mb-4">
              การดำเนินการนี้จะ:
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-1 mb-6">
              <li>ลบข้อมูลส่วนบุคคลทั้งหมดของคุณ</li>
              <li>ลบ Iris Coin ที่เหลืออยู่ทั้งหมด</li>
              <li>ไม่สามารถใช้บัญชีนี้เข้าสู่ระบบได้อีก</li>
              <li>ไม่สามารถกู้คืนได้</li>
            </ul>

            <p className="text-sm text-gray-400 mb-2">
              พิมพ์ <code className="bg-black/40 px-2 py-1 rounded">DELETE_MY_DATA</code> เพื่อยืนยัน:
            </p>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="input w-full mb-4"
              placeholder="DELETE_MY_DATA"
            />

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleteConfirmation !== 'DELETE_MY_DATA' || deleteMutation.isPending}
                className="btn bg-red-500 hover:bg-red-600 flex-1 disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                ) : (
                  'ยืนยันการลบ'
                )}
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmation('');
                }}
                className="btn btn-secondary"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
