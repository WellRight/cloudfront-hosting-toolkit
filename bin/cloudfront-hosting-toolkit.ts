/*
  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
  
  Licensed under the Apache License, Version 2.0 (the "License").
  You may not use this file except in compliance with the License.
  You may obtain a copy of the License at
  
      http://www.apache.org/licenses/LICENSE-2.0
  
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 */

import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { HostingStack } from "../lib/hosting_stack";
import { RepositoryStack } from "../lib/repository_stack";
import { HostingConfiguration } from  "./cli/shared/types";
import { Console } from 'console';
import * as path from "path";
import {
  BUILD_FILE_NAME,
  CONFIG_FILE_NAME,
  CFF_FILE_NAME,
  TOOL_NAME,
} from "./cli/shared/constants";
import { AwsSolutionsChecks } from "cdk-nag";
import { Aspects } from "aws-cdk-lib";
import { calculateConnectionStackName, calculateMainStackName, loadHostingConfiguration } from "./cli/utils/helper";

const app = new App();

//Aspects.of(app).add(new AwsSolutionsChecks());

(async () => {
  var configFilePath, configFile, certificateArn;

  /*
  if (app.node.tryGetContext("config-path")) {
    configFilePath = app.node.tryGetContext("config-path");
  }
   else {
    configFilePath = path.join(__dirname, "..", TOOL_NAME);
  }
  if (app.node.tryGetContext("certificate-arn")) {
    certificateArn = app.node.tryGetContext("certificate-arn");
  }
 */

  

  console.log("erererer");
  
  certificateArn = "arn:aws:acm:us-east-1:812501918422:certificate/a0399de6-0e57-4247-83bf-9a7ee403a9c9"

  configFile = configFilePath + "/" + CONFIG_FILE_NAME;

  const hostingConfiguration: HostingConfiguration = {
    branchName : "master",
    repoUrl: "https://github.com/WellRight/wellright.monoclient.git",
    framework: "angularjs",
    domainName : "hops2.qa.wellright.com"

  } 
  
  ///await loadHostingConfiguration(configFile);

  const buildFilePath =  "./cloudfront-hosting-toolkit/cloudfront-hosting-toolkit-build.yml";
 const  cffSourceFilePath = "./cloudfront-hosting-toolkit/cloudfront-hosting-toolkit-cff.js";

 // const buildFilePath = configFilePath + "/" + BUILD_FILE_NAME;
 // const cffSourceFilePath = configFilePath + "/" + CFF_FILE_NAME;



  const mainStackName = calculateMainStackName(hostingConfiguration);


 //   const connectionStackName = calculateConnectionStackName(hostingConfiguration.repoUrl, hostingConfiguration.branchName);

  new HostingStack(
    app,
    "qa-bokupna",
    {
      connectionArn: "arn:aws:codestar-connections:us-east-1:812501918422:connection/8bf22447-e2ca-4c43-a99f-9a304e7851f4",  //connectionStack?.repositoryConnection.connectionArn,
      hostingConfiguration: hostingConfiguration,
      buildFilePath: buildFilePath,
      cffSourceFilePath: cffSourceFilePath,
      certificateArn: certificateArn,
    },
    {
      description: 'Cloudfront Hosting Toolkit Hosting Stack (uksb-1tupboc37)',
      env: {
        region: process.env.CDK_DEFAULT_REGION,
        account: process.env.CDK_DEFAULT_ACCOUNT,
      },
      crossRegionReferences: true,
    }
  );
})();
