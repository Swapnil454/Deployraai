"use client";

import React, { useState, useEffect, useRef } from "react";
import { Calendar, Users, Monitor, GitBranch, Activity, Search, ChevronDown, Check, MoreHorizontal, X, PlusCircle, Trash, ChevronLeft, ChevronRight } from "lucide-react";

function FilterDropdown({ icon: Icon, value, onChange, options, placeholder, emptyText, className, isAuthor }: any) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((o: any) => o.value === value)?.label || placeholder;
  const isSelected = value !== 'all';

  return (
    <div className={`relative group ${className || 'shrink-0'}`} ref={wrapperRef}>
      <div 
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 h-11 px-3.5 bg-black border rounded-md text-[13px] font-medium transition-colors cursor-pointer min-w-[160px] ${isSelected ? 'border-zinc-600 text-white bg-zinc-900/30' : 'border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white'}`}
      >
        {!isSelected && (Icon ? <Icon className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-400 shrink-0" /> : <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />)}
        
        {isAuthor && isSelected && (
           <img src={`https://github.com/${value}.png`} alt="" className="h-4 w-4 rounded-full shrink-0" onError={(e:any) => e.target.style.display='none'} />
        )}
        
        <span className="truncate flex-1 text-left">{isSelected ? selectedLabel : placeholder}</span>
        
        {isSelected ? (
          <div 
             className="h-5 w-5 -mr-1 rounded-md hover:bg-zinc-800 flex items-center justify-center shrink-0 transition-colors"
             onClick={(e) => { e.stopPropagation(); onChange('all'); setOpen(false); }}
          >
             <X className="h-3.5 w-3.5 text-zinc-400 hover:text-white" />
          </div>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
        )}
      </div>

      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] left-0 w-[240px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col">
          <div className="max-h-[240px] overflow-y-auto p-1">
            <div 
              onClick={() => { onChange('all'); setOpen(false); }}
              className={`flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer ${value === 'all' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
            >
              <span>{placeholder}</span>
              {value === 'all' && <Check className="h-3.5 w-3.5" />}
            </div>
            {options.length === 0 ? (
               <div className="px-3 py-4 text-center text-zinc-600 text-[13px]">{emptyText || 'No results found.'}</div>
            ) : options.map((opt: any) => (
              <div 
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer mt-0.5 ${value === opt.value ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
              >
                <div className="flex items-center gap-2 truncate">
                  {isAuthor && (
                    <img src={`https://github.com/${opt.value}.png`} alt="" className="h-4 w-4 rounded-full shrink-0" onError={(e:any) => e.target.style.display='none'} />
                  )}
                  <span className="truncate">{opt.label}</span>
                </div>
                {value === opt.value && <Check className="h-3.5 w-3.5 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownMenu({ value, onChange, options, placeholder }: any) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((o: any) => o.value === value)?.label || placeholder;

  return (
    <div className="relative group shrink-0" ref={wrapperRef}>
      <div 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-11 px-3.5 bg-black border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer"
      >
        <span>{value === 'all' ? placeholder : selectedLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] left-0 w-[200px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl p-1 flex flex-col">
          <div 
            onClick={() => { onChange('all'); setOpen(false); }}
            className={`flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer ${value === 'all' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
          >
            <span>{placeholder}</span>
            {value === 'all' && <Check className="h-3.5 w-3.5" />}
          </div>
          {options.map((opt: any) => (
            <div 
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex items-center justify-between px-3 py-2 rounded-md text-[13px] cursor-pointer mt-0.5 ${value === opt.value ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-white'}`}
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check className="h-3.5 w-3.5" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiSelectDropdown({ values, onChange, options, placeholder }: any) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = (val: string) => {
    if (values.includes(val)) {
      const newVals = values.filter((v: string) => v !== val);
      onChange(newVals.length === 0 ? ['all'] : newVals);
    } else {
      onChange(values.filter((v: string) => v !== 'all').concat(val));
    }
  };

  const isAll = values.length === 0 || values.includes('all');
  const count = isAll ? 0 : values.length;

  return (
    <div className="relative group shrink-0" ref={wrapperRef}>
      <div 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-11 px-3.5 bg-black border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-1.5 shrink-0">
           <div className="h-2.5 w-2.5 rounded-full bg-[#55c786]"></div>
           <div className="h-2.5 w-2.5 rounded-full bg-[#c34370] -ml-1.5 border border-black"></div>
           <div className="h-2.5 w-2.5 rounded-full bg-[#f5a623] -ml-1.5 border border-black"></div>
        </div>
        <span>{placeholder}</span>
        {count > 0 && <span className="bg-zinc-800 px-1.5 py-0.5 rounded-md text-[11px] leading-none ml-1">{count}/{options.length}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 ml-1 shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] right-0 w-[200px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl p-1 flex flex-col">
          {options.map((opt: any) => {
            const isChecked = isAll ? true : values.includes(opt.value);
            return (
              <div 
                key={opt.value}
                onClick={() => {
                   if (isAll) {
                      onChange([opt.value]);
                   } else {
                      handleToggle(opt.value);
                   }
                }}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-[13px] cursor-pointer hover:bg-zinc-800/50 transition-colors ${isChecked ? 'text-white' : 'text-zinc-400'}`}
              >
                <div className={`h-3.5 w-3.5 rounded-[3px] border flex items-center justify-center shrink-0 ${isChecked ? 'bg-white border-white' : 'border-zinc-600'}`}>
                  {isChecked && <Check className="h-2.5 w-2.5 text-black" strokeWidth={3} />}
                </div>
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${opt.color}`}></div>
                <span>{opt.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

function DateRangeDropdown({ icon: Icon, dateRange, setDateRange, customStart, setCustomStart, customEnd, setCustomEnd }: any) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const initialStart = customStart ? new Date(customStart) : null;
  const initialEnd = customEnd ? new Date(customEnd) : null;

  const [tempStart, setTempStart] = useState<Date | null>(initialStart);
  const [tempEnd, setTempEnd] = useState<Date | null>(initialEnd);
  
  const [viewDate, setViewDate] = useState(() => {
    const base = initialStart || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    setTempStart(customStart ? new Date(customStart) : null);
    setTempEnd(customEnd ? new Date(customEnd) : null);
  }, [customStart, customEnd]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const firstDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
  const prevMonthDays = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth() - 1);
  
  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, prevMonthDays - firstDay + i + 1), isCurrentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth(), i), isCurrentMonth: true });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, i), isCurrentMonth: false });
  }

  const handleDateClick = (clickedDate: Date) => {
    if (!tempStart || (tempStart && tempEnd)) {
      const newStart = new Date(clickedDate);
      newStart.setHours(0, 0, 0, 0);
      setTempStart(newStart);
      setTempEnd(null);
    } else if (tempStart && !tempEnd) {
      if (clickedDate < tempStart) {
        const newStart = new Date(clickedDate);
        newStart.setHours(0, 0, 0, 0);
        setTempStart(newStart);
      } else {
        const newEnd = new Date(clickedDate);
        newEnd.setHours(23, 59, 59, 999);
        setTempEnd(newEnd);
      }
    }
  };

  const isSelected = (d: Date) => {
    if (!tempStart) return false;
    const dStr = d.toDateString();
    if (dStr === tempStart.toDateString()) return true;
    if (tempEnd && dStr === tempEnd.toDateString()) return true;
    if (tempStart && tempEnd && d > tempStart && d < tempEnd) return true;
    return false;
  };

  const formatInputDate = (d: Date | null) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const formatInputTime = (d: Date | null) => d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';

  const formatTimeForInput = (d: Date | null) => {
    if (!d) return '';
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleTimeChange = (val: string, isStart: boolean) => {
    if (!val) return;
    const [h, m] = val.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return;
    
    if (isStart && tempStart) {
      const newD = new Date(tempStart);
      newD.setHours(h, m);
      const today = new Date();
      if (newD > today) return; 
      setTempStart(newD);
    } else if (!isStart && tempEnd) {
      const newD = new Date(tempEnd);
      newD.setHours(h, m);
      const today = new Date();
      if (newD > today) return;
      setTempEnd(newD);
    }
  };

  const display = dateRange === 'custom' && customStart && customEnd 
    ? `${formatInputDate(new Date(customStart))} to ${formatInputDate(new Date(customEnd))}`
    : 'Select Date Range';

  return (
    <div className="relative group shrink-0" ref={wrapperRef}>
      <div 
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 h-11 px-3.5 bg-black border border-zinc-800 rounded-md text-[13px] font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer"
      >
        {Icon && <Icon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />}
        <span>{display}</span>
      </div>

      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] right-0 w-[320px] bg-[#0a0a0a] border border-zinc-800 rounded-xl shadow-2xl p-4">
          
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-white text-[14px] font-medium">
              {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handlePrevMonth} className="text-zinc-400 hover:text-white p-1 transition-colors"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={handleNextMonth} className="text-zinc-400 hover:text-white p-1 transition-colors"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S','M','T','W','T','F','S'].map((day, i) => (
              <div key={i} className="text-center text-[12px] font-medium text-zinc-500">{day}</div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 mb-4">
            {days.map((d, i) => {
              const selected = isSelected(d.date);
              const isStart = tempStart && d.date.toDateString() === tempStart.toDateString();
              const isEnd = tempEnd && d.date.toDateString() === tempEnd.toDateString();
              const isBetween = selected && !isStart && !isEnd;
              
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isFuture = d.date > today;
              
              return (
                <button
                  key={i}
                  disabled={isFuture}
                  onClick={() => handleDateClick(d.date)}
                  className={`
                    h-8 w-full flex items-center justify-center text-[13px] transition-colors rounded
                    ${isFuture ? 'text-zinc-700 cursor-not-allowed' : 
                      selected ? 'bg-[#0070F3] text-white' : 
                      d.isCurrentMonth ? 'text-zinc-200 hover:bg-zinc-800' : 'text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'}
                  `}
                >
                  {d.date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Time Inputs */}
          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-zinc-400 w-10">Start</span>
              <div className="flex-1 bg-black border border-zinc-800 rounded-md px-3 py-1.5 text-[13px] text-zinc-300 flex items-center justify-between">
                <span>{formatInputDate(tempStart) || '--'}</span>
              </div>
              <div className="w-[110px] bg-black border border-zinc-800 rounded-md px-2 py-1.5 flex items-center justify-center">
                <input 
                  type="time" 
                  disabled={!tempStart}
                  value={formatTimeForInput(tempStart)}
                  onChange={(e) => handleTimeChange(e.target.value, true)}
                  className="bg-transparent text-[13px] text-zinc-300 outline-none w-full text-center disabled:opacity-50 [color-scheme:dark]"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-zinc-400 w-10">End</span>
              <div className="flex-1 bg-black border border-zinc-800 rounded-md px-3 py-1.5 text-[13px] text-zinc-300 flex items-center justify-between">
                <span>{formatInputDate(tempEnd) || '--'}</span>
              </div>
              <div className="w-[110px] bg-black border border-zinc-800 rounded-md px-2 py-1.5 flex items-center justify-center">
                <input 
                  type="time" 
                  disabled={!tempEnd}
                  value={formatTimeForInput(tempEnd)}
                  onChange={(e) => handleTimeChange(e.target.value, false)}
                  className="bg-transparent text-[13px] text-zinc-300 outline-none w-full text-center disabled:opacity-50 [color-scheme:dark]"
                />
              </div>
            </div>

            <button 
              disabled={!tempStart || !tempEnd}
              onClick={() => { 
                if (tempStart && tempEnd) {
                  setCustomStart(tempStart.toISOString());
                  setCustomEnd(tempEnd.toISOString());
                  setDateRange('custom'); 
                  setOpen(false); 
                }
              }}
              className="w-full bg-white hover:bg-zinc-200 text-black text-[13px] font-medium py-2 rounded-md transition-colors disabled:opacity-50 mt-2"
            >
              Apply ↵
            </button>

            <div className="text-center mt-2 flex items-center justify-center gap-1 text-[11px] text-zinc-500 cursor-pointer hover:text-zinc-400">
              Local ({Intl.DateTimeFormat().resolvedOptions().timeZone}) <ChevronDown className="h-3 w-3" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionMenu({ onClear }: { onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative group shrink-0" ref={wrapperRef}>
      <button 
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center h-11 w-11 bg-black border border-zinc-800 rounded-md text-zinc-400 hover:border-zinc-700 hover:text-white transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] right-0 w-[220px] bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl p-1 flex flex-col">
          <div className="px-3 py-2 rounded-md text-[13px] text-zinc-500 cursor-not-allowed flex items-center gap-2">
             <PlusCircle className="h-3.5 w-3.5 shrink-0" /> Create Deployment
          </div>
          <div className="px-3 py-2 rounded-md text-[13px] text-zinc-500 cursor-not-allowed flex items-center gap-2">
             <GitBranch className="h-3.5 w-3.5 shrink-0" /> Git Settings
          </div>
          <div className="px-3 py-2 rounded-md text-[13px] text-zinc-500 cursor-not-allowed flex items-center gap-2">
             <Trash className="h-3.5 w-3.5 shrink-0" /> Deployment Retention
          </div>
          <div className="h-px bg-zinc-800 my-1 mx-1"></div>
          <div 
            onClick={() => { onClear(); setOpen(false); }}
            className="px-3 py-2 rounded-md text-[13px] text-zinc-300 hover:bg-zinc-800/50 hover:text-white cursor-pointer flex items-center gap-2 transition-colors"
          >
             <X className="h-3.5 w-3.5 shrink-0" /> Clear Filter
          </div>
        </div>
      )}
    </div>
  );
}

export function DeploymentFilterBar({
  dateRange, setDateRange,
  customStart, setCustomStart,
  customEnd, setCustomEnd,
  environment, setEnvironment,
  branch, setBranch,
  author, setAuthor,
  status, setStatus,
  authorsList, branchesList,
  onClear
}: any) {
  return (
    <div className="flex flex-wrap items-center gap-2 w-full py-4">
      {/* Left Group */}
      <div className="flex flex-1 items-center gap-3 min-w-[300px]">
        <FilterDropdown 
          icon={Search}
          value={branch}
          onChange={setBranch}
          options={branchesList}
          placeholder="All Branches..."
          emptyText="No branches found."
          className="flex-1"
        />
        <FilterDropdown 
          icon={Search}
          value={author}
          onChange={setAuthor}
          options={authorsList}
          placeholder="All Authors..."
          emptyText="No authors found."
          className="flex-1"
          isAuthor={true}
        />
      </div>

      {/* Right Group */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <DropdownMenu 
          value={environment}
          onChange={setEnvironment}
          placeholder="All Environments"
          options={[
            { value: 'production', label: 'Production' },
            { value: 'preview', label: 'Preview' }
          ]}
        />
        
        <DateRangeDropdown 
          icon={Calendar}
          dateRange={dateRange} setDateRange={setDateRange}
          customStart={customStart} setCustomStart={setCustomStart}
          customEnd={customEnd} setCustomEnd={setCustomEnd}
        />

        <MultiSelectDropdown 
          values={status}
          onChange={setStatus}
          placeholder="Status"
          options={[
            { value: 'ready', label: 'Ready', color: 'bg-[#55c786]' },
            { value: 'error', label: 'Error', color: 'bg-[#c34370]' },
            { value: 'building', label: 'Building', color: 'bg-[#f5a623]' },
            { value: 'queued', label: 'Queued', color: 'bg-zinc-500' },
            { value: 'canceled', label: 'Canceled', color: 'bg-zinc-600' }
          ]}
        />

        <ActionMenu onClear={onClear} />
      </div>
    </div>
  );
}
