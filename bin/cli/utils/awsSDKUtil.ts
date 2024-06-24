#!/usr/bin/env node
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

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  GetPipelineStateCommand,
  CodePipelineClient,
  StartPipelineExecutionCommand,
} from "@aws-sdk/client-codepipeline";
import {
  CodeStarConnectionsClient,
} from "@aws-sdk/client-codestar-connections";
import {
  ACMClient,
} from "@aws-sdk/client-acm";
import {
  Route53Client,
  
} from "@aws-sdk/client-route-53";

import {
  S3Client,
  HeadBucketCommand,
  GetBucketLocationCommand,
} from "@aws-sdk/client-s3";

const clientSSM = new SSMClient();
const clientACM = new ACMClient({ region: "us-east-1" });
const clientR53 = new Route53Client({ region: "us-east-1" });
const clientS3 = new S3Client({});

const clientCodeStar = new CodeStarConnectionsClient();
const clientCodePipeline = new CodePipelineClient();

import {
  ERROR_PREFIX,
  SSM_CONNECTION_ARN_STR,
  SSM_CONNECTION_NAME_STR,
  SSM_CONNECTION_REGION_STR,
  SSM_PIPELINENAME_STR,
} from "../shared/constants";

import {
  calculateConnectionStackName,
  calculateMainStackName,

  loadHostingConfiguration,
} from "./helper";

const util = require("util");

import {loadConfig} from "@aws-sdk/node-config-provider";
import {NODE_REGION_CONFIG_FILE_OPTIONS, NODE_REGION_CONFIG_OPTIONS} from "@aws-sdk/config-resolver";


/**
 * Checks the connection to the AWS account using AWS STS (Security Token Service).
 * Returns true if the connection is successful, otherwise displays an error and exits.
 */
export default async function checkAWSConnection() {
  const stsClient = new STSClient({});
  const getCallerIdentityCommand = new GetCallerIdentityCommand({});
  try {
    await stsClient.send(getCallerIdentityCommand);
    const currentRegion = await loadConfig(NODE_REGION_CONFIG_OPTIONS, NODE_REGION_CONFIG_FILE_OPTIONS)();

    return true;
  } catch (error) {
    
    console.error(
      `${ERROR_PREFIX} Impossible to connect to your the AWS account. Try to authenticate and try again.`
    );
    process.exit(1);
  }
}

/**
 * Checks if a specified bucket exists in Amazon S3.
 *
 * @param {string} bucketName - The name of the bucket to check.
 * @returns {Promise<boolean>} - Returns `true` if the bucket exists, `false` otherwise.
 */
export async function checkBucketExists(bucketName: string) {
  try {
    const headBucketCommand = new HeadBucketCommand({ Bucket: bucketName });

    // Check if the bucket exists
    await clientS3.send(headBucketCommand);

    // Get the current region of the bucket
    const getBucketLocationCommand = new GetBucketLocationCommand({
      Bucket: bucketName,
    });

    await clientS3.send(getBucketLocationCommand);
    return true;
  } catch (error) {
    const typedError = error as Error;

    if (typedError.name === "NotFound") {
      //console.log(`Bucket '${bucketName}' does not exist.`);
      return false;
    } else {
      //console.error("Error:", error);
      return false;
    }
  }
}




/**
 * Retrieves the value of an AWS Systems Manager (SSM) parameter by name.
 *
 * @param {string} parameterName - The name of the SSM parameter to retrieve.
 * @returns {Promise<string>} A Promise that resolves to the value of the SSM parameter.
 * @throws {Error} If there is an error while retrieving the parameter.
 */
export async function getSSMParameter(parameterName: string) {
  try {
    const hostingConfiguration = await loadHostingConfiguration();

    let stackName;
    
   // if (
  //    isRepoConfig(hostingConfiguration)
 //   ) {
      stackName = calculateConnectionStackName(
        hostingConfiguration.repoUrl,
        hostingConfiguration.branchName
      );
  //  } else {
 //     stackName = calculateMainStackName(hostingConfiguration);
 //   }
    
    const ssmParam = "/" + stackName + "/" + parameterName;
    const command = new GetParameterCommand({
      Name: ssmParam,
    });

    // Execute the command and retrieve the parameter value
    const response = await clientSSM.send(command);
    const paramValue = response.Parameter?.Value;

    return paramValue;
  } catch (err) {
    
    console.error(`Error retrieving parameter ${parameterName}`, err);
    throw err;
  }
}



export async function startPipelineExecution() {
  try {
    
    const pipelineName = await getSSMParameter(SSM_PIPELINENAME_STR);
    const params = {
      name: pipelineName,
    };

    const pipelineStatus = await getPipelineStatus();
    if (pipelineStatus.status !== "InProgress") {
      const command = new StartPipelineExecutionCommand(params);
      const response = await clientCodePipeline.send(command);
      console.log(`The pipeline has been initiated following the recent deployment to apply any changes made.`);
    }else{
      console.log("Pipeline is already in progress.");
    }
    
  } catch (error) {
    console.error("Error starting pipeline execution:", error);
    throw error;
  }
}

export async function getPipelineStatus() {
  try {
    const pipelineName = await getSSMParameter(SSM_PIPELINENAME_STR);
    //Cancelled | InProgress | Failed | Stopped | Stopping | Succeeded
    if (pipelineName) {
      const input = {
        name: pipelineName,
      };
      const command = new GetPipelineStateCommand(input);
      const response = await clientCodePipeline.send(command);
      // Extract the stage states from the response
      const stageStates = response.stageStates;

      if (stageStates && stageStates.length > 0) {
        let hasInProgress = false;
        let hasFailed = false;
        let lastStageStatus: string | null = null; // Initialize with null
        let lastStageName: string | null = null; // Initialize with null

        for (const stage of stageStates) {
          if (stage.latestExecution && stage.latestExecution.status) {
            lastStageStatus = stage.latestExecution.status;
            lastStageName = stage.stageName ?? "Unknown"; // Use "Unknown" if stageName is undefined

            if (lastStageStatus === "InProgress") {
              hasInProgress = true;
            } else if (lastStageStatus === "Failed") {
              hasFailed = true;
            }
          }
        }

        if (hasInProgress) {
          return {
            status: "InProgress",
            stageName: lastStageName || "Unknown",
          };
        } else if (hasFailed) {
          return { status: "Failed", stageName: lastStageName || "Unknown" };
        } else {
          // No stage in progress and no stage has failed, return the status of the last stage along with its name
          return {
            status: lastStageStatus || "Unknown",
            stageName: lastStageName || "Unknown",
          };
        }
      }
    }

    // If hosting.pipeline is not defined or there are no stages, return a default status and stage name (e.g., "Unknown" for both).
    return { status: "Unknown", stageName: "Unknown" };
  } catch (error) {
    console.error("Error getting Pipeline Status", error);
    throw error;
  }
}
