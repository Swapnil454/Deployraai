"use client";

import React, { useState } from "react";
import { ProjectIcon } from "./ProjectIcon";

export const ProjectAvatar = ({ project }: { project: any }) => {
  const [imgErrorCount, setImgErrorCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  
  if (!project) return <ProjectIcon name="Unknown" />;

  const isObject = typeof project === 'object';
  const root = isObject && project.configuration?.frontendRoot ? `${project.configuration.frontendRoot}/` : '';
  const branch = isObject && project.selectedBranch ? project.selectedBranch : 'main';
  const repo = isObject ? project.repoFullName : null;
  const repoName = isObject ? (project.repoName || project.name) : 'Unknown';
  
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
    return <ProjectIcon name={repoName} />;
  }

  const currentFile = possibleFiles[imgErrorCount];
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${root}public/${currentFile}`;

  return (
    <>
      {!loaded && <ProjectIcon name={repoName} />}
      <img 
        src={url} 
        alt="Project Icon" 
        className={`h-full w-full object-contain ${loaded ? 'block' : 'hidden'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setImgErrorCount(prev => prev + 1)}
      />
    </>
  );
};
