"use client";

import React, { useState } from "react";
import { ProjectIcon } from "./ProjectIcon";

export const ProjectAvatar = ({ project }: { project: any }) => {
  const [imgErrorCount, setImgErrorCount] = useState(0);
  
  const root = project.configuration?.frontendRoot ? `${project.configuration.frontendRoot}/` : '';
  const branch = project.selectedBranch || 'main';
  const repo = project.repoFullName;
  
  const possibleFiles = [
    'logo.png',
    'logo.svg',
    'icon.png',
    'icon.svg',
    'vercel.svg',
    'vite.svg',
    'favicon.ico'
  ];

  if (!repo || imgErrorCount >= possibleFiles.length) {
    return <ProjectIcon name={project.repoName} />;
  }

  const currentFile = possibleFiles[imgErrorCount];
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${root}public/${currentFile}`;

  return (
    <img 
      src={url} 
      alt="Project Icon" 
      className="h-full w-full object-contain"
      onError={() => setImgErrorCount(prev => prev + 1)}
    />
  );
};
