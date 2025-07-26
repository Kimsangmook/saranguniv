"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SIDE_MENU_ITEMS, MenuItem } from "@/lib/constants";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleMenuClick = (item: MenuItem) => {
    router.push(item.path);
    // 모바일에서는 메뉴 클릭 시 사이드바 닫기
    if (window.innerWidth < 768) {
      onToggle();
    }
  };

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <>
      {/* 모바일 오버레이 */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* 사이드바 */}
      <div className={`
        fixed top-0 left-0 h-full bg-white shadow-lg z-50 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static md:z-auto
        w-64
      `}>
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">관리 시스템</h2>
          <button
            onClick={onToggle}
            className="md:hidden p-2 rounded-md hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 메뉴 아이템들 */}
        <nav className="mt-4">
          <ul className="space-y-2">
            {SIDE_MENU_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => handleMenuClick(item)}
                  className={`
                    w-full flex items-center px-4 py-3 text-left transition-colors duration-200
                    ${isActive(item.path) 
                      ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <span className="text-lg mr-3">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* 하단 로그아웃 버튼 */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <button
            onClick={() => {
              localStorage.removeItem("attendance_token");
              router.push("/token");
            }}
            className="w-full flex items-center px-4 py-3 text-left text-red-600 hover:bg-red-50 transition-colors duration-200"
          >
            <span className="text-lg mr-3">🚪</span>
            <span className="font-medium">로그아웃</span>
          </button>
        </div>
      </div>
    </>
  );
} 